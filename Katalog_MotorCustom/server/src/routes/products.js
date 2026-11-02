import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "../db/db.js";
import { authenticateToken } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `product-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      const allowed = /jpeg|jpg|png|webp|gif/;
      const ext = path.extname(file.originalname).toLowerCase();
      const mime = file.mimetype.toLowerCase();
      if (ext && allowed.test(ext) && mime && allowed.test(mime)) {
        return cb(null, true);
      }
    }
    return cb(new Error("Only image files are allowed!"));
  },
});

const router = express.Router();

router.get("/", (req, res) => {
  const { categoryId, search, stockStatus } = req.query;
  const products = db.getProducts({ categoryId, search, stockStatus });
  res.json({
    success: true,
    count: products.length,
    data: products,
  });
});

router.get("/:id", (req, res) => {
  const product = db.getProductById(req.params.id);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }
  res.json({
    success: true,
    data: product,
  });
});

router.post("/", authenticateToken, upload.single("image"), (req, res) => {
  const { name, price, stockStatus, categoryId, description, imageurl } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Product name is required",
    });
  }
  if (!categoryId) {
    return res.status(400).json({
      success: false,
      message: "Category product is required",
    });
  }
  if (!price || isNaN(price) || price < 0) {
    return res.status(400).json({
      success: false,
      message: "Price must be a positive number",
    });
  }

  let finalImage = imageurl;
  if (req.file) {
    finalImage = `/uploads/${req.file.filename}`;
  }

  const newProduct = db.addProduct({
    name: name.trim(),
    categoryId,
    price: parseFloat(price),
    stockStatus: stockStatus || "in-stock",
    description: description ? description.trim() : "",
    image: finalImage || "",
  });

  res.status(201).json({
    success: true,
    data: newProduct,
    message: "Product added successfully",
  });
});

router.put("/:id", authenticateToken, upload.single("image"), (req, res) => {
  const { id } = req.params;
  const { name, price, stockStatus, categoryId, description, imageurl } = req.body;

  const exsisting = db.getProductById(id);
  if (!exsisting) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  const updatePayload = {};
  if (name !== undefined) updatePayload.name = name.trim();
  if (categoryId !== undefined) updatePayload.categoryId = categoryId;
  if (price !== undefined) updatePayload.price = parseFloat(price);
  if (stockStatus !== undefined) updatePayload.stockStatus = stockStatus;
  if (description !== undefined) updatePayload.description = description.trim();

  if (req.file) {
    updatePayload.image = `/uploads/${req.file.filename}`;
  } else if (imageurl !== undefined && imageurl.trim()) {
    updatePayload.image = imageurl.trim();
  }

  const updated = db.updateProduct(id, updatePayload);

  res.json({
    success: true,
    data: updated,
    message: "Product updated successfully",
  });
});

router.patch("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const updated = db.toggleStock(id);

  if (!updated) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  res.json({
    success: true,
    data: updated,
    message: `Product stock status updated to ${updated.stockStatus}`,
  });
});

router.delete("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteProduct(id);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  res.json({
    success: true,
    message: "Product deleted successfully",
  });
});

export default router;