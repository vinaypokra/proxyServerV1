const express = require("express");
const axios = require("axios");
const getRawBody = require("raw-body");
const https = require("https");

const app = express();

/* ================= GLOBAL CORS ================= */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* ================= RAW BODY ================= */
app.use(async (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  try {
    req.rawBody = await getRawBody(req, {
      encoding: req.headers["content-encoding"] ? null : "utf8",
    });
    next();
  } catch (e) {
    next(e);
  }
});

/* ================= SERVICE MAPS ================= */

const ENVIRONMENTS = {
  dev: {
    "generic-service":
      "https://dcbs-dev.pe-lab1.bdc-rancher.tecnotree.com/generic-service",
    ngb: "https://pe-lab1-dev.tecnotree.com/ngb",
    "collections-service":
      "https://dcbs-dev-ndb.pe-lab1.bdc-rancher.tecnotree.com/collections-service",
  },
  qc: {
    "generic-service":
      "https://collections-mysql.pe-lab1.bdc-rancher.tecnotree.com/generic-service",
    ngb: "https://collections-mysql.pe-lab1.bdc-rancher.tecnotree.com/ngb",
    "collections-service":
      "https://collections-mysql.pe-lab1.bdc-rancher.tecnotree.com/collections-service",
  },
};

let activeEnv = "dev";

/* ================= API LOG STORE ================= */
const apiLogs = [];
const MAX_LOGS = 100;

/* ================= ENV API ================= */

app.get("/env", (req, res) => res.json({ activeEnv }));

app.post("/env/:env", (req, res) => {
  const env = req.params.env;
  if (!ENVIRONMENTS[env]) return res.status(400).json({ error: "Invalid env" });
  activeEnv = env;
  console.log("🔥 ENV SWITCHED:", activeEnv);
  res.json({ activeEnv });
});

/* ================= LOG API ================= */
app.get("/logs", (req, res) => res.json(apiLogs));

app.delete("/logs", (req, res) => {
  apiLogs.length = 0; // clear in-place
  console.log("🧹 Logs cleared");
  res.json({ message: "Logs cleared" });
});

/* ================= UI ================= */
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Proxy Monitor</title>
<style>
body{font-family:Arial;background:#0f172a;color:white;padding:20px}
button{padding:10px 15px;margin:5px;font-size:16px;border:0;border-radius:6px;cursor:pointer}
.dev{background:#22c55e}.qc{background:#3b82f6}.clear{background:#ef4444}
table{width:100%;border-collapse:collapse;margin-top:20px}
td,th{border:1px solid #334155;padding:6px;font-size:12px}
.copy{cursor:pointer;color:#38bdf8;font-size:18px}
.copy:hover{color:#22c55e}

/* URL column fixed width */
.url-col {
  max-width: 500px;
  width: 500px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
</head>
<body>

<h2>Proxy Environment</h2>
<h3 id="env">Loading...</h3>
<button class="dev" onclick="setEnv('dev')">DEV</button>
<button class="qc" onclick="setEnv('qc')">QC</button>
<button class="clear" onclick="clearLogs()">🧹 Clear Logs</button>

<h2>Live API Logs</h2>
<table>
<thead>
<tr>
<th>Time</th>
<th>Env</th>
<th>Service</th>
<th>Method</th>
<th style="width:500px">URL</th>
<th>Copy JSON</th>
</tr>
</thead>
<tbody id="logs"></tbody>
</table>

<script>
async function refreshEnv(){
  const r = await fetch('/env');
  const d = await r.json();
  document.getElementById('env').innerText = 'Current: ' + d.activeEnv.toUpperCase();
}

async function setEnv(e){
  await fetch('/env/' + e, {method:'POST'});
  refreshEnv();
}

function copyToClipboard(obj){
  navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
  alert("Copied");
}

async function clearLogs(){
  // if(!confirm("Clear all logs?")) return;
  await fetch('/logs', { method: 'DELETE' });
  loadLogs();
}

async function loadLogs(){
  const r = await fetch('/logs');
  const logs = await r.json();
  const tbody = document.getElementById('logs');
  tbody.innerHTML='';

  logs.slice().reverse().forEach(l=>{
    const copyObj = {
      url: l.url,
      type: l.method,
      payload: l.request,
      response: l.response
    };

    const safeCopy = JSON.stringify(copyObj).replace(/'/g, "&apos;");

    const tr = document.createElement("tr");
    tr.innerHTML = \`
      <td>\${l.time}</td>
      <td>\${l.env}</td>
      <td>\${l.service}</td>
      <td>\${l.method}</td>
      <td class="url-col" title="\${l.url}">\${l.url}</td>
      <td><span class="copy" onclick='copyToClipboard(\${safeCopy})'>📋</span></td>
    \`;
    tbody.appendChild(tr);
  });
}

setInterval(loadLogs, 2000);
refreshEnv();
</script>

</body>
</html>
`);
});


/* ================= PROXY ================= */

app.use("/:serviceName/*", async (req, res) => {
  const serviceName = req.params.serviceName;
  const wildcardPath = req.params[0] || ""; // ✅ SAFE

  const services = ENVIRONMENTS[activeEnv];
  if (!services[serviceName]) {
    return res.status(404).json({ error: "Unknown service" });
  }

  const isTokenCall = wildcardPath.includes("token");
  const target = isTokenCall
    ? "http://localhost:8081/generic-service"
    : services[serviceName];

  const forwardUrl = target + req.originalUrl.replace(`/${serviceName}`, "");

  let reqJson = null;
  try {
    reqJson = JSON.parse(req.rawBody);
  } catch {}

  try {
    const resp = await axios({
      method: req.method,
      url: forwardUrl,
      data: req.rawBody,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: { ...req.headers, host: undefined },
      validateStatus: () => true,
    });

    let resJson = resp.data;
    if (typeof resJson === "string") {
      try {
        resJson = JSON.parse(resJson);
      } catch {}
    }

    apiLogs.push({
      time: new Date().toISOString(),
      env: activeEnv,
      service: serviceName,
      method: req.method,
      url: req.originalUrl,
      request: reqJson,
      response: resJson,
    });
    if (apiLogs.length > MAX_LOGS) apiLogs.shift();

    res.set("Access-Control-Allow-Origin", "*");
    return res.status(resp.status).send(resp.data);
  } catch (e) {
    console.error("Proxy error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ================= START ================= */
app.listen(3001, () => {
  console.log("Proxy running http://localhost:3001");
});
