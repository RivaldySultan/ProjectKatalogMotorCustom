import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "url";
import { db } from "../db/db.js";
import { authenticateAdmin } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, "../../uploads");
const productUploadDir = path.join(uploadDir, "products");
const maxImageSize = 5 * 1024 * 1024;
const allowedImages = new Map([
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
  ["image/png", new Set([".png"])],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxImageSize, files: 1 },
  fileFilter: (req, file, callback) => {
    const extensions = allowedImages.get(file.mimetype);
    const extension = path.extname(file.originalname).toLowerCase();
    if (!extensions?.has(extension)) {
      callback(new Error("Foto utama hanya boleh berformat JPG atau PNG."));
      return;
    }
    callback(null, true);
  },
});

const router = express.Router();

function parseProductUpload(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    const isSizeError = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
    res.status(isSizeError ? 413 : 400).json({
      success: false,
      message: isSizeError
        ? "Ukuran foto utama maksimal 5 MB."
        : error.message || "Foto utama tidak dapat diunggah.",
    });
  });
}

function validateProductInput(body, { currentProduct, hasImage }) {
  const required = [
    ["name", "Nama build wajib diisi."],
    ["basis", "Basis motor wajib diisi."],
    ["categoryId", "Kategori gaya wajib dipilih."],
    ["description", "Deskripsi build wajib diisi."],
    ["imageAlt", "Teks alternatif gambar wajib diisi."],
  ];

  for (const [field, message] of required) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return message;
    }
  }

  const price = Number(body.price);
  if (!Number.isSafeInteger(price) || price <= 0) {
    return "Harga build harus berupa angka positif.";
  }
  if (body.name.trim().length > 120 || body.basis.trim().length > 160) {
    return "Nama build maksimal 120 karakter dan basis motor maksimal 160 karakter.";
  }
  if (body.description.trim().length > 3000 || body.imageAlt.trim().length > 180) {
    return "Deskripsi maksimal 3.000 karakter dan teks alternatif maksimal 180 karakter.";
  }
  for (const field of ["buildName", "engine", "transmission", "cockpit", "finishing"]) {
    if (typeof body[field] === "string" && body[field].trim().length > 240) {
      return "Nama seri dan spesifikasi teknis maksimal 240 karakter.";
    }
  }
  if (typeof body.specNotes === "string" && body.specNotes.trim().length > 3000) {
    return "Catatan spesifikasi maksimal 3.000 karakter.";
  }
  const purchaseType = body.purchaseType || "consultation_only";
  const purchaseEnabled = body.purchaseEnabled === true || body.purchaseEnabled === "true";
  const fixedSpecifications = typeof body.fixedSpecifications === "string"
    ? body.fixedSpecifications.trim()
    : "";
  const stockQuantity = Number(body.purchaseStockQuantity || 0);
  const estimatedBuildDays = body.estimatedBuildDays === "" ? null : Number(body.estimatedBuildDays);
  if (!["ready_stock", "made_to_order", "consultation_only"].includes(purchaseType)) {
    return "Jenis ketersediaan pembelian tidak valid.";
  }
  if (typeof body.purchaseEnabled !== "undefined" && !["true", "false", true, false].includes(body.purchaseEnabled)) {
    return "Pengaturan pembelian langsung tidak valid.";
  }
  if (fixedSpecifications.length > 3000) {
    return "Spesifikasi tetap maksimal 3.000 karakter.";
  }
  if (purchaseEnabled) {
    const specificationLines = fixedSpecifications.split(/\r?\n/).filter((line) => line.trim());
    if (!["ready_stock", "made_to_order"].includes(purchaseType)) {
      return "Pembelian langsung hanya dapat diaktifkan untuk ready stock atau made to order.";
    }
    if (specificationLines.length === 0 || specificationLines.some((line) => !/^.{1,60}:\s*.+$/.test(line.trim()))) {
      return "Isi spesifikasi final dengan format Label: nilai, satu spesifikasi per baris.";
    }
    if (purchaseType === "ready_stock" && (
      !Number.isSafeInteger(stockQuantity) || stockQuantity < 1 || stockQuantity > 10000
      || (body.stockStatus || currentProduct?.stockStatus) !== "Tersedia"
    )) {
      return "Ready stock memerlukan status Tersedia dan jumlah stok 1-10.000.";
    }
    if (purchaseType === "made_to_order" && body.estimatedBuildDays !== "" && (
      !Number.isSafeInteger(estimatedBuildDays) || estimatedBuildDays < 1 || estimatedBuildDays > 365
    )) {
      return "Estimasi pengerjaan harus berupa 1-365 hari.";
    }
  }
  if (!hasImage && !currentProduct?.image) {
    return "Foto utama wajib diunggah saat membuat motor baru.";
  }
  return "";
}

function isValidImageSignature(file) {
  if (file.mimetype === "image/jpeg") {
    return file.buffer.length >= 3
      && file.buffer[0] === 0xff
      && file.buffer[1] === 0xd8
      && file.buffer[2] === 0xff;
  }
  if (file.mimetype === "image/png") {
    return file.buffer.length >= 8
      && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return false;
}

function storeProductImage(file) {
  if (!isValidImageSignature(file)) {
    const error = new Error("Isi file tidak sesuai dengan format JPG atau PNG.");
    error.status = 400;
    throw error;
  }

  const extension = file.mimetype === "image/png" ? ".png" : ".jpg";
  const filename = `${randomUUID()}${extension}`;
  fs.mkdirSync(productUploadDir, { recursive: true });
  fs.writeFileSync(path.join(productUploadDir, filename), file.buffer, { flag: "wx" });
  return `/uploads/products/${filename}`;
}

function removeManagedImage(image) {
  if (typeof image !== "string" || !image.startsWith("/uploads/products/")) return;
  if (db.isPurchaseImageInUse(image)) return;
  const filename = path.basename(image);
  const imagePath = path.join(productUploadDir, filename);
  if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
}

function getProductPayload(body, image) {
  return {
    name: body.name.trim(),
    buildName: body.buildName?.trim() || null,
    categoryId: body.categoryId.trim(),
    basis: body.basis.trim(),
    price: Number(body.price),
    stockStatus: body.stockStatus?.trim() || "Tersedia",
    description: body.description.trim(),
    engine: body.engine?.trim() || null,
    transmission: body.transmission?.trim() || null,
    cockpit: body.cockpit?.trim() || null,
    finishing: body.finishing?.trim() || null,
    specNotes: body.specNotes?.trim() || null,
    image,
    imageAlt: body.imageAlt.trim(),
    purchaseType: body.purchaseType || "consultation_only",
    purchaseEnabled: body.purchaseEnabled === true || body.purchaseEnabled === "true",
    fixedSpecifications: body.fixedSpecifications?.trim() || "",
    estimatedBuildDays: body.estimatedBuildDays ? Number(body.estimatedBuildDays) : null,
    purchaseStockQuantity: body.purchaseStockQuantity ? Number(body.purchaseStockQuantity) : 0,
  };
}

router.get("/", (req, res) => {
  const { categoryId, search, stockStatus } = req.query;
  const products = db.getProducts({ categoryId, search, stockStatus });
  res.json({ success: true, count: products.length, data: products });
});

router.get("/:id", (req, res) => {
  const product = db.getProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: "Motor tidak ditemukan." });
  }
  res.json({ success: true, data: product });
});

router.post("/", authenticateAdmin, parseProductUpload, (req, res) => {
  const validationError = validateProductInput(req.body, { hasImage: Boolean(req.file) });
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }
  if (!db.getCategoryById(req.body.categoryId.trim())) {
    return res.status(400).json({ success: false, message: "Kategori gaya tidak valid." });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: "Foto utama wajib diunggah." });
  }

  let image;
  try {
    image = storeProductImage(req.file);
    const product = db.addProduct(getProductPayload(req.body, image));
    res.status(201).json({ success: true, data: product, message: "Motor berhasil disimpan." });
  } catch (error) {
    if (image) removeManagedImage(image);
    console.error("Gagal menyimpan motor:", error);
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Motor belum dapat disimpan.",
    });
  }
});

router.put("/:id", authenticateAdmin, parseProductUpload, (req, res) => {
  const currentProduct = db.getProductById(req.params.id);
  if (!currentProduct) {
    return res.status(404).json({ success: false, message: "Motor tidak ditemukan." });
  }
  const validationError = validateProductInput(req.body, {
    currentProduct,
    hasImage: Boolean(req.file),
  });
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }
  if (!db.getCategoryById(req.body.categoryId.trim())) {
    return res.status(400).json({ success: false, message: "Kategori gaya tidak valid." });
  }

  let replacementImage;
  try {
    replacementImage = req.file ? storeProductImage(req.file) : currentProduct.image;
    const updated = db.updateProduct(
      req.params.id,
      getProductPayload(req.body, replacementImage),
    );
    if (req.file && currentProduct.image !== replacementImage) {
      removeManagedImage(currentProduct.image);
    }
    res.json({ success: true, data: updated, message: "Perubahan motor berhasil disimpan." });
  } catch (error) {
    if (req.file && replacementImage) removeManagedImage(replacementImage);
    console.error(`Gagal memperbarui motor ${req.params.id}:`, error);
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Perubahan motor belum dapat disimpan.",
    });
  }
});

router.patch("/:id", authenticateAdmin, (req, res) => {
  const updated = db.toggleStock(req.params.id);
  if (!updated) {
    return res.status(404).json({ success: false, message: "Motor tidak ditemukan." });
  }
  res.json({ success: true, data: updated, message: "Status motor berhasil diperbarui." });
});

router.delete("/:id", authenticateAdmin, (req, res) => {
  const product = db.getProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: "Motor tidak ditemukan." });
  }

  try {
    const deleted = db.deleteProduct(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Motor tidak ditemukan." });
    }
    res.json({ success: true, message: "Motor berhasil dihapus. Riwayat konsultasi tetap tersimpan." });
  } catch (error) {
    console.error(`Gagal menghapus motor ${req.params.id}:`, error);
    res.status(409).json({
      success: false,
      message: "Motor belum dapat dihapus karena masih digunakan oleh data lain.",
    });
  }
});

export default router;
