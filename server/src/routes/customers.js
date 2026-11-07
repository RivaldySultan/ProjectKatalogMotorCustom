import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db/db.js";
import { authenticateCustomer, CUSTOMER_SESSION_COOKIE } from "../middleware/customerAuth.js";
import { JWT_SECRET } from "../middleware/auth.js";
import { getPaymentInstructions } from "../services/paymentService.js";
import {
  finishCustomerSecurityPasswordReset,
  normalizeSecurityAnswer,
  SECURITY_QUESTION_IDS,
  verifyCustomerSecurityAnswer,
} from "../services/securityQuestionService.js";

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

function hashCustomerPassword(password) {
  const digest = createHash("sha256").update(password, "utf8").digest("hex");
  return bcrypt.hash(digest, 12).then((hash) => `sha256$${hash}`);
}

function verifyCustomerPassword(password, passwordHash) {
  if (passwordHash.startsWith("sha256$")) {
    const digest = createHash("sha256").update(password, "utf8").digest("hex");
    return bcrypt.compare(digest, passwordHash.slice("sha256$".length));
  }
  return bcrypt.compare(password, passwordHash);
}

function validateProfile({ fullName, email, phone }) {
  if (typeof fullName !== "string" || fullName.trim().length < 2 || fullName.trim().length > 120) {
    return "Full name is required (2–120 characters).";
  }
  if (
    typeof email !== "string"
    || email.trim().length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return "Invalid email address.";
  }
  if (
    typeof phone !== "string"
    || !/^[+\d\s().-]{8,24}$/.test(phone.trim())
    || !normalizePhone(phone)
  ) {
    return "Invalid WhatsApp number.";
  }
  return "";
}

function validateSecurityQuestion(questionId, answer) {
  if (typeof questionId !== "string" || !SECURITY_QUESTION_IDS.has(questionId)) {
    return "Choose a valid security question.";
  }
  if (
    typeof answer !== "string"
    || !normalizeSecurityAnswer(answer)
    || Buffer.byteLength(normalizeSecurityAnswer(answer), "utf8") > 72
  ) {
    return "Security answer is required and must be at most 72 bytes.";
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
  const securityQuestionError = validateSecurityQuestion(body.securityQuestion, body.securityAnswer);
  if (securityQuestionError) {
    return res.status(400).json({ success: false, message: securityQuestionError });
  }
  if (
    typeof body.password !== "string"
    || Buffer.byteLength(body.password, "utf8") < 8
    || Buffer.byteLength(body.password, "utf8") > 1024
  ) {
    return res.status(400).json({ success: false, message: "Password must be 8–1024 bytes." });
  }
  if (body.password !== body.confirmPassword) {
    return res.status(400).json({ success: false, message: "Password confirmation does not match." });
  }
  if (body.privacyConsent !== true) {
    return res.status(400).json({ success: false, message: "Privacy consent is required." });
  }
  if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
    return res.status(503).json({ success: false, message: "Authentication has not been securely configured." });
  }

  const email = normalizeEmail(body.email);
  if (db.getAdminByEmail(email) || db.getCustomerByEmail(email)) {
    return res.status(409).json({ success: false, message: "This email address is already in use." });
  }
  const phone = normalizePhone(body.phone);
  if (db.getActiveCustomersByPhone(phone).length) {
    return res.status(409).json({ success: false, message: "This WhatsApp number is already in use." });
  }

  try {
    const customer = db.createCustomer({
      id: randomUUID(),
      fullName: body.fullName.trim(),
      email,
      phone,
      passwordHash: await hashCustomerPassword(body.password),
      securityQuestion: body.securityQuestion,
      securityAnswerHash: await bcrypt.hash(normalizeSecurityAnswer(body.securityAnswer), 10),
    });
    const session = createCustomerToken(customer);
    setCustomerCookie(res, session.token);
    return res.status(201).json({
      success: true,
      data: { ...safeProfile(customer), expiresAt: session.expiresAt },
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ success: false, message: "This email address is already in use." });
    }
    console.error("Failed to create customer account:", error);
    return res.status(500).json({ success: false, message: "The customer account could not be created." });
  }
});

router.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || typeof password !== "string" || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }
  if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
    return res.status(503).json({ success: false, message: "Authentication has not been securely configured." });
  }
  const customer = db.getCustomerByEmail(email);
  const validPassword = customer?.isActive === 1
    ? await verifyCustomerPassword(password, customer.passwordHash)
    : false;
  if (!validPassword) {
    return res.status(401).json({ success: false, message: "Incorrect email or password." });
  }
  const session = createCustomerToken(customer);
  setCustomerCookie(res, session.token);
  return res.json({
    success: true,
    data: { ...safeProfile(customer), expiresAt: session.expiresAt },
  });
});

router.post("/forgot-password/verify", async (req, res) => {
  const { email, questionId, answer } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (
    typeof email !== "string"
    || normalizedEmail.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    || typeof questionId !== "string"
    || !SECURITY_QUESTION_IDS.has(questionId)
    || typeof answer !== "string"
    || !normalizeSecurityAnswer(answer)
    || Buffer.byteLength(normalizeSecurityAnswer(answer), "utf8") > 72
  ) {
    return res.status(400).json({
      success: false,
      message: "The information could not be verified. Check your details and try again.",
    });
  }

  try {
    const result = await verifyCustomerSecurityAnswer({
      email: normalizedEmail,
      questionId,
      answer,
      ipAddress: req.ip || req.socket.remoteAddress,
    });
    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: "The information could not be verified. Check your details and try again.",
      });
    }
    return res.json({ success: true, data: { resetToken: result.token } });
  } catch (error) {
    console.error("Failed to verify the customer security answer:", error);
    return res.status(500).json({
      success: false,
      message: "The information could not be verified. Please try again later.",
    });
  }
});

router.post("/forgot-password/reset", async (req, res) => {
  const { resetToken, password, confirmPassword } = req.body || {};
  if (typeof resetToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(resetToken)) {
    return res.status(400).json({ success: false, message: "Verify your security answer before changing the password." });
  }
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") < 8 || Buffer.byteLength(password, "utf8") > 1024) {
    return res.status(400).json({ success: false, message: "Password must be 8–1024 bytes." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: "Password confirmation does not match." });
  }

  try {
    const result = finishCustomerSecurityPasswordReset({
      token: resetToken,
      passwordHash: await hashCustomerPassword(password),
    });
    if (result !== "success") {
      return res.status(400).json({
        success: false,
        message: "Your verification has expired. Verify your security answer again.",
      });
    }
    return res.json({
      success: true,
      data: { message: "Password reset successful. Please log in with your new password." },
    });
  } catch (error) {
    console.error("Failed to reset the customer password using a security question:", error);
    return res.status(500).json({ success: false, message: "The password could not be reset." });
  }
});

router.get("/me", authenticateCustomer, (req, res) => {
  return res.json({ success: true, data: safeProfile(req.customer) });
});

router.get("/me/security-question", authenticateCustomer, (req, res) => {
  const customer = db.getCustomerById(req.customer.id);
  return res.json({
    success: true,
    data: { securityQuestion: customer?.securityQuestion || null },
  });
});

router.put("/me/security-question", authenticateCustomer, async (req, res) => {
  const { currentPassword, securityQuestion, securityAnswer } = req.body || {};
  const validationError = validateSecurityQuestion(securityQuestion, securityAnswer);
  if (validationError) return res.status(400).json({ success: false, message: validationError });
  if (typeof currentPassword !== "string" || !currentPassword) {
    return res.status(400).json({ success: false, message: "Enter your current password to confirm this change." });
  }

  const customer = db.getCustomerById(req.customer.id);
  const passwordMatches = customer
    ? await verifyCustomerPassword(currentPassword, customer.passwordHash)
    : false;
  if (!passwordMatches) {
    return res.status(401).json({ success: false, message: "Current password is incorrect." });
  }

  try {
    const updated = db.updateCustomerSecurityQuestion(customer.id, {
      securityQuestion,
      securityAnswerHash: await bcrypt.hash(normalizeSecurityAnswer(securityAnswer), 10),
    });
    if (!updated) return res.status(404).json({ success: false, message: "Customer account not found." });
    return res.json({
      success: true,
      data: { securityQuestion },
      message: "Security question saved.",
    });
  } catch (error) {
    console.error("Failed to save the customer security question:", error);
    return res.status(500).json({ success: false, message: "The security question could not be saved." });
  }
});

router.patch("/me", authenticateCustomer, (req, res) => {
  const body = req.body || {};
  const validationError = validateProfile(body);
  if (validationError) return res.status(400).json({ success: false, message: validationError });
  const email = normalizeEmail(body.email);
  const existing = db.getCustomerByEmail(email);
  if (db.getAdminByEmail(email) || (existing && existing.id !== req.customer.id)) {
    return res.status(409).json({ success: false, message: "This email address is already in use." });
  }
  const phone = normalizePhone(body.phone);
  if (db.getActiveCustomersByPhone(phone).some((customer) => customer.id !== req.customer.id)) {
    return res.status(409).json({ success: false, message: "This WhatsApp number is already in use." });
  }
  try {
    const customer = db.updateCustomerProfile(req.customer.id, {
      fullName: body.fullName.trim(),
      email,
      phone,
    });
    if (!customer) return res.status(404).json({ success: false, message: "Customer account not found." });
    return res.json({ success: true, data: safeProfile(customer) });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ success: false, message: "This email address is already in use." });
    }
    console.error("Failed to update customer profile:", error);
    return res.status(500).json({ success: false, message: "The profile could not be updated." });
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
    "delivered",
    "completed",
    "cancelled",
  ];
  if (status && !statuses.includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid order status filter." });
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
  if (!order) return res.status(404).json({ success: false, message: "Order not found." });
  return res.json({ success: true, data: withPaymentInstructions(order) });
});

router.delete("/orders/:id", authenticateCustomer, (req, res) => {
  try {
    const result = db.hideCustomerPurchaseOrder(req.customer.id, req.params.id);
    if (!result.found) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }
    if (!result.deleted) {
      return res.status(409).json({
        success: false,
        message: "Only completed or cancelled orders can be removed from your history.",
      });
    }
    return res.json({ success: true, message: "Order removed from your history." });
  } catch (error) {
    console.error("Failed to remove customer order history:", error);
    return res.status(500).json({ success: false, message: "Order history could not be removed." });
  }
});

router.post("/orders/:id/confirm-received", authenticateCustomer, (req, res) => {
  if (!db.getCustomerPurchaseOrderById(req.customer.id, req.params.id)) {
    return res.status(404).json({ success: false, message: "Order not found." });
  }
  try {
    const order = db.confirmCustomerPurchaseReceived(req.customer.id, req.params.id);
    if (!order) {
      return res.status(409).json({
        success: false,
        message: "Only paid orders that are ready for pickup or have arrived at the delivery destination can be confirmed as received.",
      });
    }
    return res.json({ success: true, data: order });
  } catch (error) {
    console.error("Failed to confirm customer order receipt:", error);
    return res.status(500).json({ success: false, message: "Order receipt could not be confirmed." });
  }
});

router.get("/orders/:id/proofs/:proofId", authenticateCustomer, (req, res) => {
  const proofId = req.params.proofId === "current" ? "" : req.params.proofId;
  const filename = db.getCustomerPaymentProof(req.customer.id, req.params.id, proofId);
  if (!filename) return res.status(404).json({ success: false, message: "Payment proof not found." });
  const proofDirectory = path.resolve(
    process.env.PAYMENT_PROOF_UPLOAD_DIR
      || fileURLToPath(new URL("../../uploads/payment-proofs/", import.meta.url)),
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.sendFile(path.basename(filename), { root: proofDirectory, dotfiles: "deny" }, (error) => {
    if (error && !res.headersSent) {
      console.error("Failed to serve customer payment proof:", error);
      res.status(404).json({ success: false, message: "Payment proof could not be opened." });
    }
  });
});

router.post("/claims/:id", authenticateCustomer, (req, res) => {
  const accessToken = req.get("x-order-access-token") || "";
  if (
    !/^[a-f0-9]{64}$/i.test(accessToken)
    || !db.verifyPurchaseAccess(req.params.id, accessToken)
  ) {
    return res.status(404).json({ success: false, message: "Order not found or access token is invalid." });
  }
  const order = db.claimGuestPurchaseOrder(req.params.id, req.customer.id);
  if (!order) {
    return res.status(409).json({
      success: false,
      message: "The order could not be linked. Make sure the email address and WhatsApp number match the account, or that the order has not already been linked.",
    });
  }
  return res.json({ success: true, data: order });
});

export default router;
