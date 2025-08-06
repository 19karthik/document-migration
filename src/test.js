// src/test.js

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Worker running!");
});

app.listen(3033, () => {
  console.log(`Express server running on port ${PORT}`);
});
