const express = require("express");
const app = express();
const cors = require("cors");
const axios = require("axios");
const http = require('https');
const url =
  "http://dcbs-dev.pe-lab1.bdc-rancher.tecnotree.com/ngb/subscribers";

app.use(cors());



// At request level


const error = (err, res) => {
  const { status = "", statusText = "", data = {} } = err?.response || {};
  const { error = "", message = "" } = data;
  console.log("error", err);
  res.status(status).send(message);
};
const arr = [
  "profile/CompositeProfile/V1/",
  "billing-account/CompositeBillingAccount/V1/",
  "service-account/CompositeServiceAccount/V1/",
];

arr.map((item) => {
  app.get(`/${item}:name`, async (req, res) => {
    const name = req.params.name;
    const agent = new http.Agent({
        rejectUnauthorized: false,
      });
    const config = {
      method: "get",
      url: `${url}/${item}${name}`,
      httpsAgent: agent,
      headers: {
        authorization: req.headers.authorization,
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        Accept: "*/*",
      },
    };
    axios(config)
      .then(function (response) {
        res.send(response.data);
      })
      .catch(function (err) {
        error(err, res);
      });
  });
});

app.listen(3001, () => {
  console.log("Proxy On 3001");
});
