const express = require("express");
const axios = require("axios");
const getRawBody = require("raw-body");
const cors = require("cors");
const https = require("https");

const app = express();

// 🔥 GLOBAL CORS HANDLER (Fix #1)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200); // preflight passes instantly
  }

  next();
});

// Capture RAW request body (Fix #2: skip for OPTIONS)
app.use(async (req, res, next) => {
  if (req.method === "OPTIONS") return next(); // VERY IMPORTANT

  try {
    req.rawBody = await getRawBody(req, {
      encoding: req.headers["content-encoding"] ? null : "utf8",
    });
    next();
  } catch (err) {
    next(err);
  }
});

// Microservice map
const services = {
  localGeneric: "http://localhost:8081/generic-service",
  "generic-service":
    "https://collections-mysql.pe-lab1.bdc-rancher.tecnotree.com/generic-service",
  ngb: "https://collections-mysql.pe-lab1.bdc-rancher.tecnotree.com/ngb",
  "collections-service":
    "https://collections-mysql.pe-lab1.bdc-rancher.tecnotree.com/collections-service",
  // "generic-service":
  //   "https://dcbs-dev.pe-lab1.bdc-rancher.tecnotree.com/generic-service",
  // ngb: "https://pe-lab1-dev.tecnotree.com/ngb",
  // "collections-service":
  //   "https://dcbs-dev-ndb.pe-lab1.bdc-rancher.tecnotree.com/collections-service",
};

// Proxy handler
app.use("/:serviceName/*", async (req, res) => {
  const serviceName = req.params.serviceName;
  console.log({ req });
  if (!services[serviceName]) {
    return res.status(404).json({ error: "Unknown service" });
  }
  const isTokenCall = req.params[0].includes("token");

  const target = isTokenCall ? services["localGeneric"] : services[serviceName];
  const forwardUrl = target + req.originalUrl.replace(`/${serviceName}`, "");

  console.log("===============================================");
  console.log("📥 INCOMING REQUEST FROM REACT");
  console.log("Service:", serviceName);
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  // console.log("Headers:", req.headers);
  console.log("Body RAW:", req.rawBody?.toString());
  console.log("Forwarding to:", forwardUrl);

  try {
    const axiosResponse = await axios({
      method: req.method,
      url: forwardUrl,
      data: req.rawBody,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // ignore cert mismatch
      }),
      headers: {
        ...req.headers,
        host: undefined,
        "content-length": req.rawBody ? Buffer.byteLength(req.rawBody) : 0,
      },
      validateStatus: () => true,
    });

    console.log("⬅️ RESPONSE RECEIVED FROM MICROSERVICE");
    console.log("Status:", axiosResponse.status);
    // console.log("Headers:", axiosResponse.headers);
    console.log("Body:", axiosResponse.data);
    console.log("===============================================");

    // 🔥 Fix #3 — Remove backend CORS headers (they break browser CORS)
    delete axiosResponse.headers["access-control-allow-origin"];
    delete axiosResponse.headers["access-control-allow-headers"];
    delete axiosResponse.headers["access-control-allow-methods"];

    // Force correct CORS headers
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });

    // Copy backend headers except problematic ones
    for (const [key, value] of Object.entries(axiosResponse.headers)) {
      if (
        key.toLowerCase() !== "content-length" &&
        key.toLowerCase() !== "transfer-encoding" &&
        key.toLowerCase() !== "connection"
      ) {
        res.setHeader(key, value);
      }
    }

    return res.status(axiosResponse.status).send(axiosResponse.data);
  } catch (error) {
    console.log("❌ ERROR CALLING MICROSERVICE");
    if (error.response) {
      console.log("Response error:", error.response.data);
      return res.status(error.response.status).send(error.response.data);
    }
    console.log("Error:", error.message);
    res.status(500).json({ error: "Proxy error", details: error.message });
  }
});

app.listen(3001, () => {
  console.log("🚀 Axios Proxy server running at http://localhost:3001");
});
