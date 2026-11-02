const express = require("express");
const cors = require("cors");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send("Hello Dari Server!");
});

app.get("/api/products", (req, res) => {
    const produk = [
        {
            id: 1, 
            nama: "Caferacer", 
            harga: 5000 
        },
        {
            id: 2, 
            nama: "Chooper", 
            harga: 7000 
        },
        {   id: 3,
            nama: "BritishStyle",
            harga: 6000
        }
    ];

    res.json(produk);
});

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});