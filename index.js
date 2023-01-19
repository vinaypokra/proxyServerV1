const express = require("express");
const app = express();
const cors = require("cors");
const axios = require("axios");
const http = require('https');
const url =
  "http://dcbs-dev.pe-lab1.bdc-rancher.tecnotree.com/ngb/subscribers";

app.use(cors());



const arr = [
  {
    path: "user",
    res: {
      name: "Vinay",
    },
  },
  {
    path: "users",
    res: [
      {
        name: "Vinay",
      },
    ],
  },
];

arr.map((item) => {
  app.get(`/${item.path}`, async (req, res) => {
    res.send(item.res);
  });
});
    

app.listen(3001, () => {
  console.log("Proxy On 3001");
});
