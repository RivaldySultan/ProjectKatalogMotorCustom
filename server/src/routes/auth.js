import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/db.js";
import { authenticateAdmin, JWT_SECRET } from "../middleware/auth.js";
import {
  finishPasswordReset,
  isWhatsAppOtpConfigured,
  normalizeWhatsAppNumber,
  sendPasswordResetOtp,
} from "../services/passwordResetService.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  const admin = db.getAdmin();

  if (
    !admin ||
    admin.isActive !== 1 ||
    email.trim().toLowerCase() !== admin.email.toLowerCase()
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
  }

  const isMatch = bcrypt.compareSync(password, admin.password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
  }

  if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
    return res.status(500).json({
      success: false,
      message: "JWT_SECRET has not been securely configured (at least 32 bytes are required).",
    });
  }

  const token = jwt.sign(
    {
      email: admin.email,
      name: admin.name,
      role: "admin",
      authVersion: admin.authVersion,
    },
    JWT_SECRET,
    {
      subject: admin.id,
      expiresIn: "24h",
    },
  );
  return res.json({
    success: true,
    message: "Login successful",
    token,
    user: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
  });
});

router.post("/forgot-password", async (req, res) => {
  const phone = normalizeWhatsAppNumber(req.body?.phone);
  if (!phone) {
    return res.status(400).json({ success: false, message: "Enter a valid WhatsApp number." });
  }
  if (!isWhatsAppOtpConfigured()) {
    return res.status(503).json({
      success: false,
      message: "WhatsApp OTP delivery is not configured on the server.",
    });
  }

  try {
    const admin = db.getAdmin();
    if (admin?.isActive === 1 && admin.phone === phone) {
      await sendPasswordResetOtp({ accountType: "admin", accountId: admin.id, phone });
    }
    return res.status(202).json({
      success: true,
      message: "If an active admin account uses this number, a reset code will be sent via WhatsApp.",
    });
  } catch (error) {
    console.error("Failed to deliver the admin password reset OTP:", error.message);
    return res.status(502).json({
      success: false,
      message: "The WhatsApp OTP could not be sent. Please try again later.",
    });
  }
});

router.post("/reset-password", async (req, res) => {
  const phone = normalizeWhatsAppNumber(req.body?.phone);
  const { otp, password } = req.body || {};
  if (!phone || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ success: false, message: "Enter the WhatsApp number and six-digit code." });
  }
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ success: false, message: "Password must be 8–72 bytes." });
  }

  const admin = db.getAdmin();
  if (!admin || admin.isActive !== 1 || admin.phone !== phone) {
    return res.status(400).json({ success: false, message: "The code is invalid or expired. Request a new code." });
  }

  try {
    const result = finishPasswordReset({
      accountType: "admin",
      accountId: admin.id,
      phone,
      otp,
      passwordHash: await bcrypt.hash(password, 10),
    });
    if (result !== "success") {
      return res.status(400).json({ success: false, message: "The code is invalid or expired. Request a new code." });
    }
    return res.json({ success: true, message: "Password reset successful. Please log in with your new password." });
  } catch (error) {
    console.error("Failed to reset the admin password:", error);
    return res.status(500).json({ success: false, message: "The password could not be reset." });
  }
});

router.get("/me", authenticateAdmin, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.admin.id,
      email: req.admin.email,
      name: req.admin.name,
    },
  });
});

export default router;
