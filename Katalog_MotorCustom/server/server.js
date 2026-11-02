const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;

app.use(express.json());

app.use(cors());
app.get("/", (req, res) => {
  res.send("Hello, Server is running!");
});

app.get("/api/products", (req, res) => {
  const products = [
    {
      id: 1,
      name: "Thunder",
      price: 1500000,
      description: "Cafe Racer style motorcycle.",
    },
    {
      id: 2,
      name: "Scorpio",
      price: 1800000,
      description: "Chooper style motorcycle.",
    },
    {
      id: 3,
      name: "Tiger",
      price: 2000000,
      description: "British Style motorcycle.",
    },
  ];

  res.json(products);
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
