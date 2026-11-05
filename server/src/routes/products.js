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
      callback(new Error("The main photo must be a JPG or PNG."));
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
        ? "The main photo must not exceed 5 MB."
        : error.message || "The main photo could not be uploaded.",
    });
  });
}

function validateProductInput(body, { currentProduct, hasImage }) {
  const required = [
    ["name", "Build name is required."],
    ["basis", "Motorcycle basis is required."],
    ["categoryId", "A style category must be selected."],
    ["description", "Build description is required."],
    ["imageAlt", "Image alt text is required."],
  ];

  for (const [field, message] of required) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return message;
    }
  }

  const price = Number(body.price);
  if (!Number.isSafeInteger(price) || price <= 0) {
    return "Build price must be a positive number.";
  }
  if (body.name.trim().length > 120 || body.basis.trim().length > 160) {
    return "Build names must not exceed 120 characters and motorcycle bases must not exceed 160 characters.";
  }
  if (body.description.trim().length > 3000 || body.imageAlt.trim().length > 180) {
    return "Descriptions must not exceed 3,000 characters and alt text must not exceed 180 characters.";
  }
  for (const field of ["buildName", "engine", "transmission", "cockpit", "finishing"]) {
    if (typeof body[field] === "string" && body[field].trim().length > 240) {
      return "Series names and technical specifications must not exceed 240 characters.";
    }
  }
  if (typeof body.specNotes === "string" && body.specNotes.trim().length > 3000) {
    return "Specification notes must not exceed 3,000 characters.";
  }
  const purchaseType = body.purchaseType || "consultation_only";
  const purchaseEnabled = body.purchaseEnabled === true || body.purchaseEnabled === "true";
  const fixedSpecifications = typeof body.fixedSpecifications === "string"
    ? body.fixedSpecifications.trim()
    : "";
  const stockQuantity = Number(body.purchaseStockQuantity || 0);
  const estimatedBuildDays = body.estimatedBuildDays === "" ? null : Number(body.estimatedBuildDays);
  if (!["ready_stock", "made_to_order", "consultation_only"].includes(purchaseType)) {
    return "Invalid purchase availability type.";
  }
  if (typeof body.purchaseEnabled !== "undefined" && !["true", "false", true, false].includes(body.purchaseEnabled)) {
    return "Invalid direct purchase settings.";
  }
  if (fixedSpecifications.length > 3000) {
    return "Fixed specifications must not exceed 3,000 characters.";
  }
  if (purchaseEnabled) {
    const specificationLines = fixedSpecifications.split(/\r?\n/).filter((line) => line.trim());
    if (!["ready_stock", "made_to_order"].includes(purchaseType)) {
      return "Direct purchase can only be enabled for ready stock or made-to-order builds.";
    }
    if (specificationLines.length === 0 || specificationLines.some((line) => !/^.{1,60}:\s*.+$/.test(line.trim()))) {
      return "Enter final specifications in Label: value format, one specification per line.";
    }
    if (purchaseType === "ready_stock" && (
      !Number.isSafeInteger(stockQuantity) || stockQuantity < 1 || stockQuantity > 10000
      || (body.stockStatus || currentProduct?.stockStatus) !== "Tersedia"
    )) {
      return "Ready stock requires Available status and a stock quantity of 1–10,000.";
    }
    if (purchaseType === "made_to_order" && body.estimatedBuildDays !== "" && (
      !Number.isSafeInteger(estimatedBuildDays) || estimatedBuildDays < 1 || estimatedBuildDays > 365
    )) {
      return "Estimated build time must be between 1 and 365 days.";
    }
  }
  if (!hasImage && !currentProduct?.image) {
    return "A main photo is required when adding a new motorcycle.";
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
    const error = new Error("The file contents do not match the JPG or PNG format.");
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
    return res.status(404).json({ success: false, message: "Motorcycle not found." });
  }
  res.json({ success: true, data: product });
});

router.post("/", authenticateAdmin, parseProductUpload, (req, res) => {
  const validationError = validateProductInput(req.body, { hasImage: Boolean(req.file) });
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }
  if (!db.getCategoryById(req.body.categoryId.trim())) {
    return res.status(400).json({ success: false, message: "Invalid style category." });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: "A main photo is required." });
  }

  let image;
  try {
    image = storeProductImage(req.file);
    const product = db.addProduct(getProductPayload(req.body, image));
    res.status(201).json({ success: true, data: product, message: "Motorcycle saved." });
  } catch (error) {
    if (image) removeManagedImage(image);
    console.error("Failed to save motorcycle:", error);
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "The motorcycle could not be saved.",
    });
  }
});

router.put("/:id", authenticateAdmin, parseProductUpload, (req, res) => {
  const currentProduct = db.getProductById(req.params.id);
  if (!currentProduct) {
    return res.status(404).json({ success: false, message: "Motorcycle not found." });
  }
  const validationError = validateProductInput(req.body, {
    currentProduct,
    hasImage: Boolean(req.file),
  });
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }
  if (!db.getCategoryById(req.body.categoryId.trim())) {
    return res.status(400).json({ success: false, message: "Invalid style category." });
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
    res.json({ success: true, data: updated, message: "Motorcycle changes saved." });
  } catch (error) {
    if (req.file && replacementImage) removeManagedImage(replacementImage);
    console.error(`Failed to update motorcycle ${req.params.id}:`, error);
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Motorcycle changes could not be saved.",
    });
  }
});

router.patch("/:id", authenticateAdmin, (req, res) => {
  const updated = db.toggleStock(req.params.id);
  if (!updated) {
    return res.status(404).json({ success: false, message: "Motorcycle not found." });
  }
  res.json({ success: true, data: updated, message: "Motorcycle status updated." });
});

router.delete("/:id", authenticateAdmin, (req, res) => {
  const product = db.getProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: "Motorcycle not found." });
  }

  try {
    const deleted = db.deleteProduct(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Motorcycle not found." });
    }
    res.json({ success: true, message: "Motorcycle deleted. Consultation history remains intact." });
  } catch (error) {
    console.error(`Failed to delete motorcycle ${req.params.id}:`, error);
    res.status(409).json({
      success: false,
      message: "The motorcycle could not be deleted because it is still used by other data.",
    });
  }
});

export default router;
