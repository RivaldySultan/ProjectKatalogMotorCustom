import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/db.js";
import { authenticateAdmin, JWT_SECRET } from "../middleware/auth.js";

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
