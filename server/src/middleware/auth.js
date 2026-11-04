import jwt from "jsonwebtoken";
import { db } from "../db/db.js";

const JWT_SECRET = process.env.JWT_SECRET;
const isJwtSecretConfigured =
  typeof JWT_SECRET === "string" && Buffer.byteLength(JWT_SECRET, "utf8") >= 32;

export const authenticateToken = (req, res, next) => {
  if (!isJwtSecretConfigured) {
    return res.status(503).json({
      success: false,
      message: "Autentikasi belum dikonfigurasi. Atur JWT_SECRET minimal 32 byte.",
    });
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token is missing",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: "Token tidak valid atau telah kedaluwarsa.",
      });
    }
    req.user = user;
    next();
  });
};

export const authenticateAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    const { sub, email, role } = req.user || {};
    if (role !== "admin" || typeof sub !== "string" || !email) {
      return res.status(403).json({
        success: false,
        message: "Akses khusus admin diperlukan.",
      });
    }

    try {
      const admin = db.getAdminById(sub);
      if (!admin || admin.isActive !== 1 || admin.email !== email) {
        return res.status(403).json({
          success: false,
          message: "Akun admin tidak aktif atau tidak memiliki akses.",
        });
      }

      req.admin = admin;
      return next();
    } catch (error) {
      console.error("Gagal memverifikasi akun admin:", error);
      return res.status(500).json({
        success: false,
        message: "Akun admin belum dapat diverifikasi.",
      });
    }
  });
};

export { JWT_SECRET };
