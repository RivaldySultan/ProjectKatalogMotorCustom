import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { db } from "../db/db.js";
import { authenticateAdmin } from "../middleware/auth.js";
import { authenticateCustomer, optionalCustomer } from "../middleware/customerAuth.js";
import {
  getAvailablePaymentMethods,
  getPaymentInstructions,
} from "../services/paymentService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const proofDirectory = path.resolve(
  process.env.PAYMENT_PROOF_UPLOAD_DIR || path.join(__dirname, "../../uploads/payment-proofs"),
);
const router = express.Router();
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
      callback(new Error("Payment proof must be a JPG or PNG."));
      return;
    }
    callback(null, true);
  },
});

function requestFailure(error, res, fallback) {
  if (error.code === "PRODUCT_UNAVAILABLE") {
    return res.status(409).json({ success: false, message: error.message });
  }
  if (error.code === "IDEMPOTENCY_CONFLICT") {
    return res.status(409).json({ success: false, message: error.message });
  }
  if (error.code === "ORDER_NOT_PAYABLE" || error.code === "PAYMENT_NOT_REVIEWABLE") {
    return res.status(409).json({ success: false, message: error.message });
  }
  if (
    error.code === "ORDER_NOT_APPROVABLE"
    || error.code === "PRODUCT_SNAPSHOT_MISMATCH"
    || error.code === "SHIPPING_QUOTE_REQUIRED"
  ) {
    return res.status(409).json({ success: false, message: error.message });
  }
  if (error.code === "STOCK_UNAVAILABLE") {
    return res.status(409).json({ success: false, message: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ success: false, message: fallback });
}

function validateCreateOrder(body) {
  const requiredText = [
    ["customerName", 2, 120],
    ["phone", 8, 24],
    ["city", 2, 120],
  ];
  for (const [field, minimum, maximum] of requiredText) {
    if (typeof body[field] !== "string" || body[field].trim().length < minimum || body[field].trim().length > maximum) {
      return `${field} is required and must be ${minimum}–${maximum} characters long.`;
    }
  }
  if (!/^[+\d\s().-]{8,24}$/.test(body.phone.trim())) {
    return "Invalid WhatsApp number.";
  }
  if (body.email && (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))) {
    return "Invalid email address.";
  }
  if (!["pickup", "delivery"].includes(body.shippingMethod)) {
    return "Choose pickup or delivery.";
  }
  if (body.shippingMethod === "delivery" && (typeof body.deliveryAddress !== "string" || body.deliveryAddress.trim().length < 8 || body.deliveryAddress.trim().length > 1000)) {
    return "Delivery address is required (8–1,000 characters).";
  }
  if (!["gopay", "seabank"].includes(body.paymentMethod)) {
    return "Payment method unavailable.";
  }
  if (typeof body.idempotencyKey !== "string" || !/^[a-f0-9-]{36}$/i.test(body.idempotencyKey)) {
    return "Invalid order key.";
  }
  if (typeof body.accessToken !== "string" || !/^[a-f0-9]{64}$/i.test(body.accessToken)) {
    return "Invalid order access token.";
  }
  if (typeof body.productId !== "string" || body.productId.length > 100) {
    return "Invalid product.";
  }
  return "";
}

function hasValidImageSignature(file) {
  if (file.mimetype === "image/jpeg") {
    return file.buffer.length >= 3
      && file.buffer[0] === 0xff
      && file.buffer[1] === 0xd8
      && file.buffer[2] === 0xff;
  }
  return file.mimetype === "image/png"
    && file.buffer.length >= 8
    && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function loadProof(req, res, next) {
  proofUpload.single("proof")(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({
      success: false,
      message: tooLarge ? "Payment proof must not exceed 5 MB." : error.message,
    });
  });
}

function withPaymentInstructions(order) {
  const paymentInstructions = order.approvalStatus === "approved"
    && order.orderStatus === "awaiting_payment"
    ? getPaymentInstructions(order.paymentMethod, order.totalAmount, order.orderNumber)
    : null;
  return { ...order, paymentInstructions };
}

router.get("/payment-methods", (req, res) => {
  res.json({ success: true, data: getAvailablePaymentMethods() });
});

router.post("/", authenticateCustomer, (req, res) => {
  const validationError = validateCreateOrder(req.body || {});
  if (validationError) return res.status(400).json({ success: false, message: validationError });
  if (!getAvailablePaymentMethods().some(({ method }) => method === req.body.paymentMethod)) {
    return res.status(503).json({
      success: false,
      message: "This payment method is not configured. The order was not created.",
    });
  }

  const request = {
    customerId: req.customer.id,
    productId: req.body.productId,
    customerName: req.body.customerName.trim(),
    phone: req.body.phone.trim(),
    email: req.body.email?.trim() || "",
    city: req.body.city.trim(),
    shippingMethod: req.body.shippingMethod,
    deliveryAddress: req.body.deliveryAddress?.trim() || "",
    paymentMethod: req.body.paymentMethod,
  };
  const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  try {
    const created = db.createPurchaseOrder({
      ...request,
      idempotencyKey: req.body.idempotencyKey,
      requestHash,
      accessTokenHash: createHash("sha256").update(req.body.accessToken).digest("hex"),
    });
    const order = { ...created.order };
    delete order.paymentProof;
    delete order.customerId;
    res.status(created.duplicate ? 200 : 201).json({
      success: true,
      data: {
        ...withPaymentInstructions(order),
        accessToken: req.body.accessToken,
      },
    });
  } catch (error) {
    requestFailure(error, res, "The purchase order could not be created.");
  }
});

router.get("/admin", authenticateAdmin, (req, res) => {
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(50, Number.parseInt(req.query.pageSize, 10) || 10));
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const allowedStatuses = [
    "pending_approval",
    "waiting_shipping_quote",
    "pending_payment",
    "waiting_verification",
    "payment_rejected",
    "paid",
    "processing",
    "ready",
    "delivered",
    "rejected",
  ];
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid order status filter." });
  }
  const result = db.getPurchaseOrders({ search, status, page, pageSize });
  return res.json({ success: true, data: result });
});

router.delete("/admin", authenticateAdmin, (req, res) => {
  try {
    const cancelledCount = db.cancelAndHideAllPurchaseOrders(req.admin.id);
    return res.json({
      success: true,
      data: { cancelledCount },
      message: `${cancelledCount} purchase order${cancelledCount === 1 ? "" : "s"} cancelled and removed from Purchase Orders.`,
    });
  } catch (error) {
    requestFailure(error, res, "Purchase order history could not be cancelled.");
  }
});

router.delete("/admin/:id", authenticateAdmin, (req, res) => {
  try {
    const order = db.cancelAndHidePurchaseOrder(req.params.id, req.admin.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    return res.json({ success: true, message: "Order cancelled and removed from Purchase Orders." });
  } catch (error) {
    requestFailure(error, res, "The order could not be cancelled.");
  }
});

router.get("/admin/:id", authenticateAdmin, (req, res) => {
  const order = db.getPurchaseOrderById(req.params.id);
  if (!order || order.adminHiddenAt) return res.status(404).json({ success: false, message: "Order not found." });
  const hasPaymentProof = Boolean(order.paymentProof);
  const safeOrder = { ...order };
  delete safeOrder.paymentProof;
  return res.json({
    success: true,
    data: {
      ...withPaymentInstructions(safeOrder),
      paymentProofUrl: hasPaymentProof ? `/api/purchases/admin/${encodeURIComponent(order.id)}/proof` : null,
    },
  });
});

router.patch("/admin/:id/approval", authenticateAdmin, (req, res) => {
  const decision = req.body?.decision;
  if (decision === "rejected") {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "A reason for rejection is required (10–1,000 characters).",
      });
    }
    const order = db.rejectPurchaseOrder(req.params.id, reason);
    if (!order) {
      return res.status(409).json({ success: false, message: "The order is no longer awaiting approval." });
    }
    const safeOrder = { ...order };
    delete safeOrder.paymentProof;
    return res.json({ success: true, data: safeOrder });
  }
  if (decision !== "approved") {
    return res.status(400).json({ success: false, message: "Choose whether to approve or reject the order." });
  }
  const existingOrder = db.getPurchaseOrderById(req.params.id);
  if (!existingOrder) {
    return res.status(404).json({ success: false, message: "Order not found." });
  }
  if (existingOrder.approvalStatus !== "pending_approval") {
    return res.status(409).json({ success: false, message: "The order is no longer awaiting approval." });
  }
  if (!getAvailablePaymentMethods().some(({ method }) => method === existingOrder.paymentMethod)) {
    return res.status(503).json({
      success: false,
      message: "The order payment method is not configured. Approval was not saved.",
    });
  }
  try {
    const order = db.approvePurchaseOrder(req.params.id);
    const safeOrder = { ...order };
    delete safeOrder.paymentProof;
    return res.json({ success: true, data: withPaymentInstructions(safeOrder) });
  } catch (error) {
    requestFailure(error, res, "Order approval could not be saved.");
  }
});

router.get("/admin/:id/proof", authenticateAdmin, (req, res) => {
  const order = db.getPurchaseOrderById(req.params.id);
  if (!order?.paymentProof || order.adminHiddenAt) {
    return res.status(404).json({ success: false, message: "Payment proof not found." });
  }
  const filename = path.basename(order.paymentProof);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.sendFile(filename, { root: proofDirectory, dotfiles: "deny" }, (error) => {
    if (error && !res.headersSent) {
      console.error("Failed to serve payment proof:", error);
      res.status(404).json({ success: false, message: "Payment proof could not be opened." });
    }
  });
});

router.post("/admin/:id/shipping-quote", authenticateAdmin, (req, res) => {
  const shippingCost = Number(req.body?.shippingCost);
  if (!Number.isSafeInteger(shippingCost) || shippingCost < 0 || shippingCost > 100000000) {
    return res.status(400).json({ success: false, message: "Shipping cost must be a valid amount in Rupiah." });
  }
  const order = db.setPurchaseShippingQuote(req.params.id, shippingCost);
  if (!order) return res.status(409).json({ success: false, message: "The order is not awaiting a shipping quote." });
  const safeOrder = { ...order };
  delete safeOrder.paymentProof;
  return res.json({ success: true, data: withPaymentInstructions(safeOrder) });
});

router.post("/admin/:id/payment-review", authenticateAdmin, (req, res) => {
  if (!["paid", "rejected"].includes(req.body?.decision)) {
    return res.status(400).json({ success: false, message: "Choose whether to confirm or reject the payment proof." });
  }
  try {
    const order = db.reviewPurchasePayment(req.params.id, req.body.decision);
    if (!order) return res.status(409).json({ success: false, message: "Order not found." });
    const safeOrder = { ...order };
    delete safeOrder.paymentProof;
    return res.json({ success: true, data: safeOrder });
  } catch (error) {
    requestFailure(error, res, "Payment status could not be updated.");
  }
});

router.patch("/admin/:id/status", authenticateAdmin, (req, res) => {
  if (req.body?.status === "completed") {
    const current = db.getPurchaseOrderById(req.params.id);
    if (
      current
      && ["ready_for_pickup", "delivered"].includes(current.orderStatus)
      && !current.canAdminComplete
    ) {
      return res.status(409).json({
        success: false,
        message: "The customer must confirm receipt, or three days must pass after the admin marks the order as arrived at its destination.",
      });
    }
  }
  const order = db.updatePurchaseOrderStatus(req.params.id, req.body?.status);
  if (!order) return res.status(409).json({
    success: false,
    message: req.body?.status === "completed"
      ? "This order cannot be completed until receipt is confirmed or three days have passed after it arrived at its destination."
      : "This build status is not valid for this order.",
  });
  const { paymentProof, ...safeOrder } = order;
  return res.json({ success: true, data: safeOrder });
});

router.post("/:id/payment-proof", optionalCustomer, loadProof, (req, res) => {
  const accessToken = req.get("x-order-access-token") || "";
  const guestAccessValid = /^[a-f0-9]{64}$/i.test(accessToken)
    && db.verifyPurchaseAccess(req.params.id, accessToken);
  const existingOrder = db.getPurchaseOrderById(req.params.id);
  if (!existingOrder) {
    return res.status(404).json({ success: false, message: "Order not found." });
  }
  const isOwner = Boolean(req.customer && existingOrder.customerId === req.customer.id);
  if (!isOwner && !guestAccessValid) {
    return res.status(404).json({ success: false, message: "Order not found or access token is invalid." });
  }
  if (!req.file || !hasValidImageSignature(req.file)) {
    return res.status(400).json({ success: false, message: "Upload a valid JPG or PNG transfer proof." });
  }

  const extension = req.file.mimetype === "image/png" ? ".png" : ".jpg";
  const filename = `${randomUUID()}${extension}`;
  let savedPath;
  let savedToDatabase = false;
  try {
    fs.mkdirSync(proofDirectory, { recursive: true });
    savedPath = path.join(proofDirectory, filename);
    fs.writeFileSync(savedPath, req.file.buffer, { flag: "wx" });
    const order = db.savePurchasePaymentProof(req.params.id, filename, isOwner ? req.customer.id : null);
    if (!order) throw new Error("Order not found.");
    savedToDatabase = true;
    const safeOrder = isOwner
      ? db.getCustomerPurchaseOrderById(req.customer.id, req.params.id)
      : db.getCustomerPurchaseOrder(req.params.id, accessToken);
    return res.json({ success: true, data: withPaymentInstructions(safeOrder) });
  } catch (error) {
    if (!savedToDatabase && savedPath && fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
    requestFailure(error, res, "Payment proof could not be saved.");
  }
});

router.get("/:id/proof", optionalCustomer, (req, res) => {
  const accessToken = req.get("x-order-access-token") || "";
  const guestAccessValid = /^[a-f0-9]{64}$/i.test(accessToken)
    && db.verifyPurchaseAccess(req.params.id, accessToken);
  const existingOrder = db.getPurchaseOrderById(req.params.id);
  if (!existingOrder) {
    return res.status(404).json({ success: false, message: "Order not found." });
  }
  const isOwner = Boolean(req.customer && existingOrder.customerId === req.customer.id);
  if (!isOwner && !guestAccessValid) {
    return res.status(404).json({ success: false, message: "Order not found or access token is invalid." });
  }
  if (!existingOrder.paymentProof) {
    return res.status(404).json({ success: false, message: "Payment proof not found." });
  }
  const filename = path.basename(existingOrder.paymentProof);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.sendFile(filename, { root: proofDirectory, dotfiles: "deny" }, (error) => {
    if (error && !res.headersSent) {
      console.error("Failed to serve payment proof:", error);
      res.status(404).json({ success: false, message: "Payment proof could not be opened." });
    }
  });
});

router.get("/:id", (req, res) => {
  const accessToken = req.get("x-order-access-token") || "";
  const order = db.getCustomerPurchaseOrder(req.params.id, accessToken);
  if (!order) return res.status(404).json({ success: false, message: "Order not found or access token is invalid." });
  return res.json({ success: true, data: withPaymentInstructions(order) });
});

export default router;
