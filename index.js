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

/* ================= RAW BODY CAPTURE ================= */
app.use(async (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  try {
    req.rawBody = await getRawBody(req, {
      encoding: req.headers["content-encoding"] ? null : "utf8",
    });
    next();
  } catch (err) {
    next(err);
  }
});

/* ================= SERVICE MAPS ================= */

const qc = {
  "generic-service":
    "https://collections-mysql.pe-lab1.bdc-rancher.tecnotree.com/generic-service",
  ngb: "https://collections-mysql.pe-lab1.bdc-rancher.tecnotree.com/ngb",
  "collections-service":
    "https://collections-mysql.pe-lab1.bdc-rancher.tecnotree.com/collections-service",
};

const dev = {
  "generic-service":
    "https://dcbs-dev.pe-lab1.bdc-rancher.tecnotree.com/generic-service",
  ngb: "https://pe-lab1-dev.tecnotree.com/ngb",
  "collections-service":
    "https://dcbs-dev-ndb.pe-lab1.bdc-rancher.tecnotree.com/collections-service",
};

const ENV_MAP = { dev, qc };
let activeEnv = "dev"; // default

/* ================= ENV TOGGLE API ================= */

app.get("/env", (req, res) => {
  res.json({ activeEnv });
});

app.post("/env/:envName", (req, res) => {
  const { envName } = req.params;
  if (!ENV_MAP[envName]) return res.status(400).json({ error: "Invalid env" });

  activeEnv = envName;
  console.log("🔥 ENV SWITCHED TO:", activeEnv);
  res.json({ message: "Environment updated", activeEnv });
});

/* ================= WEB UI PAGE ================= */

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Proxy Environment Switcher</title>
<style>
body { font-family: Arial; background:#0f172a; color:white; padding:40px; }
button { padding:12px 20px; margin:10px; font-size:18px; border:none; border-radius:6px; cursor:pointer; }
.dev { background:#22c55e; }
.qc { background:#3b82f6; }
</style>
</head>
<body>
<h2>🚀 Proxy Environment Switcher</h2>
<h3 id="status">Loading...</h3>
<button class="dev" onclick="setEnv('dev')">DEV</button>
<button class="qc" onclick="setEnv('qc')">QC</button>

<script>
async function loadEnv() {
  const res = await fetch('/env');
  const data = await res.json();
  document.getElementById("status").innerText =
    "Current Environment: " + data.activeEnv.toUpperCase();
}

async function setEnv(env) {
  await fetch('/env/' + env, { method:'POST' });
  loadEnv();
}

loadEnv();
</script>
</body>
</html>
`);
});

/* ================= PROXY HANDLER ================= */

app.use("/:serviceName/*", async (req, res) => {
  const serviceName = req.params.serviceName;
  const services = ENV_MAP[activeEnv];

  if (!services[serviceName]) {
    return res.status(404).json({ error: "Unknown service" });
  }

  const isTokenCall = req.params[0].includes("token");
  const target = isTokenCall
    ? "http://localhost:8081/generic-service"
    : services[serviceName];

  const forwardUrl = target + req.originalUrl.replace(`/${serviceName}`, "");

  console.log("===============================================");
  console.log("ENV:", activeEnv);
  console.log("Service:", serviceName);
  console.log("Forwarding:", forwardUrl);

  try {
    const axiosResponse = await axios({
      method: req.method,
      url: forwardUrl,
      data: req.rawBody,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        ...req.headers,
        host: undefined,
        "content-length": req.rawBody ? Buffer.byteLength(req.rawBody) : 0,
      },
      validateStatus: () => true,
    });

    // Remove backend CORS headers
    delete axiosResponse.headers["access-control-allow-origin"];
    delete axiosResponse.headers["access-control-allow-headers"];
    delete axiosResponse.headers["access-control-allow-methods"];

    // Force proxy CORS
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });

    // Copy safe headers
    for (const [k, v] of Object.entries(axiosResponse.headers)) {
      if (
        !["content-length", "transfer-encoding", "connection"].includes(
          k.toLowerCase(),
        )
      ) {
        res.setHeader(k, v);
      }
    }

    return res.status(axiosResponse.status).send(axiosResponse.data);
  } catch (err) {
    console.error("❌ Proxy Error:", err.message);
    return res.status(500).json({ error: "Proxy error", details: err.message });
  }
});

/* ================= START SERVER ================= */

app.listen(3001, () => {
  console.log("🚀 Proxy running at http://localhost:3001");
  console.log("🌍 UI: http://localhost:3001");
});
