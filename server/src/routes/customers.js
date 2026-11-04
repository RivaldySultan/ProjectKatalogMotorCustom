import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db/db.js";
import { authenticateCustomer, CUSTOMER_SESSION_COOKIE } from "../middleware/customerAuth.js";
import { JWT_SECRET } from "../middleware/auth.js";
import { getPaymentInstructions } from "../services/paymentService.js";

const router = express.Router();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const international = digits.startsWith("00")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? `62${digits.slice(1)}`
      : digits;
  return /^\d{10,15}$/.test(international) ? international : "";
}

function validateProfile({ fullName, email, phone }) {
  if (typeof fullName !== "string" || fullName.trim().length < 2 || fullName.trim().length > 120) {
    return "Nama lengkap wajib diisi (2-120 karakter).";
  }
  if (
    typeof email !== "string"
    || email.trim().length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return "Alamat email tidak valid.";
  }
  if (
    typeof phone !== "string"
    || !/^[+\d\s().-]{8,24}$/.test(phone.trim())
    || !normalizePhone(phone)
  ) {
    return "Nomor WhatsApp tidak valid.";
  }
  return "";
}

function safeProfile(customer) {
  return {
    id: customer.id,
    fullName: customer.fullName,
    email: customer.email,
    phone: customer.phone,
    createdAt: customer.createdAt,
  };
}

function createCustomerToken(customer) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.createCustomerSession({
    id: sessionId,
    customerId: customer.id,
    expiresAt,
  });
  const token = jwt.sign(
    { email: customer.email, role: "customer" },
    JWT_SECRET,
    { subject: customer.id, jwtid: sessionId, expiresIn: "24h" },
  );
  return { token, expiresAt };
}

function setCustomerCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${CUSTOMER_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=86400${secure}`,
  );
}

function clearCustomerCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${CUSTOMER_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0${secure}`,
  );
}

router.post("/register", async (req, res) => {
  const body = req.body || {};
  const validationError = validateProfile(body);
  if (validationError) return res.status(400).json({ success: false, message: validationError });
  if (typeof body.password !== "string" || body.password.length < 12 || Buffer.byteLength(body.password, "utf8") > 72) {
    return res.status(400).json({
      success: false,
      message: "Kata sandi harus minimal 12 karakter dan maksimal 72 byte.",
    });
  }
  if (!/[a-z]/.test(body.password) || !/[A-Z]/.test(body.password) || !/\d/.test(body.password)) {
    return res.status(400).json({
      success: false,
      message: "Kata sandi harus mengandung huruf kecil, huruf besar, dan angka.",
    });
  }
  if (body.password !== body.confirmPassword) {
    return res.status(400).json({ success: false, message: "Konfirmasi kata sandi tidak cocok." });
  }
  if (body.privacyConsent !== true) {
    return res.status(400).json({ success: false, message: "Persetujuan privasi wajib diberikan." });
  }
  if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
    return res.status(503).json({ success: false, message: "Autentikasi belum dikonfigurasi dengan aman." });
  }

  const email = normalizeEmail(body.email);
  if (db.getAdminByEmail(email) || db.getCustomerByEmail(email)) {
    return res.status(409).json({ success: false, message: "Email tersebut sudah digunakan." });
  }

  try {
    const customer = db.createCustomer({
      id: randomUUID(),
      fullName: body.fullName.trim(),
      email,
      phone: normalizePhone(body.phone),
      passwordHash: await bcrypt.hash(body.password, 12),
    });
    const session = createCustomerToken(customer);
    setCustomerCookie(res, session.token);
    return res.status(201).json({
      success: true,
      data: { ...safeProfile(customer), expiresAt: session.expiresAt },
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ success: false, message: "Email tersebut sudah digunakan." });
    }
    console.error("Gagal membuat akun pelanggan:", error);
    return res.status(500).json({ success: false, message: "Akun pelanggan belum dapat dibuat." });
  }
});

router.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ success: false, message: "Email dan kata sandi wajib diisi." });
  }
  if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
    return res.status(503).json({ success: false, message: "Autentikasi belum dikonfigurasi dengan aman." });
  }
  const customer = db.getCustomerByEmail(email);
  const validPassword = customer?.isActive === 1
    ? await bcrypt.compare(password, customer.passwordHash)
    : false;
  if (!validPassword) {
    return res.status(401).json({ success: false, message: "Email atau kata sandi tidak cocok." });
  }
  const session = createCustomerToken(customer);
  setCustomerCookie(res, session.token);
  return res.json({
    success: true,
    data: { ...safeProfile(customer), expiresAt: session.expiresAt },
  });
});

router.get("/me", authenticateCustomer, (req, res) => {
  return res.json({ success: true, data: safeProfile(req.customer) });
});

router.patch("/me", authenticateCustomer, (req, res) => {
  const body = req.body || {};
  const validationError = validateProfile(body);
  if (validationError) return res.status(400).json({ success: false, message: validationError });
  const email = normalizeEmail(body.email);
  const existing = db.getCustomerByEmail(email);
  if (db.getAdminByEmail(email) || (existing && existing.id !== req.customer.id)) {
    return res.status(409).json({ success: false, message: "Email tersebut sudah digunakan." });
  }
  try {
    const customer = db.updateCustomerProfile(req.customer.id, {
      fullName: body.fullName.trim(),
      email,
      phone: normalizePhone(body.phone),
    });
    if (!customer) return res.status(404).json({ success: false, message: "Akun pelanggan tidak ditemukan." });
    return res.json({ success: true, data: safeProfile(customer) });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ success: false, message: "Email tersebut sudah digunakan." });
    }
    console.error("Gagal memperbarui profil pelanggan:", error);
    return res.status(500).json({ success: false, message: "Profil belum dapat diperbarui." });
  }
});

router.post("/logout", authenticateCustomer, (req, res) => {
  db.revokeCustomerSession(req.customerSessionId, req.customer.id);
  clearCustomerCookie(res);
  return res.json({ success: true });
});

router.get("/orders", authenticateCustomer, (req, res) => {
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(50, Number.parseInt(req.query.pageSize, 10) || 10));
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const sort = req.query.sort === "asc" ? "asc" : "desc";
  const statuses = [
    "pending_approval",
    "waiting_shipping_quote",
    "pending_payment",
    "waiting_verification",
    "rejected",
    "payment_rejected",
    "paid",
    "expired",
    "processing",
    "ready",
    "completed",
    "cancelled",
  ];
  if (status && !statuses.includes(status)) {
    return res.status(400).json({ success: false, message: "Filter status pesanan tidak valid." });
  }
  const result = db.getCustomerPurchaseOrders(req.customer.id, { status, sort, page, pageSize });
  return res.json({ success: true, data: result });
});

function withPaymentInstructions(order) {
  const paymentInstructions = order.approvalStatus === "approved"
    && order.orderStatus === "awaiting_payment"
    ? getPaymentInstructions(order.paymentMethod, order.totalAmount, order.orderNumber)
    : null;
  return { ...order, paymentInstructions };
}

router.get("/orders/:id", authenticateCustomer, (req, res) => {
  const order = db.getCustomerPurchaseOrderById(req.customer.id, req.params.id);
  if (!order) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });
  return res.json({ success: true, data: withPaymentInstructions(order) });
});

router.get("/orders/:id/proofs/:proofId", authenticateCustomer, (req, res) => {
  const proofId = req.params.proofId === "current" ? "" : req.params.proofId;
  const filename = db.getCustomerPaymentProof(req.customer.id, req.params.id, proofId);
  if (!filename) return res.status(404).json({ success: false, message: "Bukti pembayaran tidak ditemukan." });
  const proofDirectory = path.resolve(
    process.env.PAYMENT_PROOF_UPLOAD_DIR
      || fileURLToPath(new URL("../../uploads/payment-proofs/", import.meta.url)),
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.sendFile(path.basename(filename), { root: proofDirectory, dotfiles: "deny" }, (error) => {
    if (error && !res.headersSent) {
      console.error("Gagal menyajikan bukti pembayaran pelanggan:", error);
      res.status(404).json({ success: false, message: "Bukti pembayaran tidak dapat dibuka." });
    }
  });
});

router.post("/claims/:id", authenticateCustomer, (req, res) => {
  const accessToken = req.get("x-order-access-token") || "";
  if (
    !/^[a-f0-9]{64}$/i.test(accessToken)
    || !db.verifyPurchaseAccess(req.params.id, accessToken)
  ) {
    return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan atau token akses tidak valid." });
  }
  const order = db.claimGuestPurchaseOrder(req.params.id, req.customer.id);
  if (!order) {
    return res.status(409).json({
      success: false,
      message: "Pesanan tidak dapat ditautkan. Pastikan email dan WhatsApp cocok dengan akun, atau pesanan sudah ditautkan.",
    });
  }
  return res.json({ success: true, data: order });
});

export default router;
