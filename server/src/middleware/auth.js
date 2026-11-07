import jwt from "jsonwebtoken";
import { db } from "../db/db.js";

const JWT_SECRET = process.env.JWT_SECRET;
const isJwtSecretConfigured =
  typeof JWT_SECRET === "string" && Buffer.byteLength(JWT_SECRET, "utf8") >= 32;

export const authenticateToken = (req, res, next) => {
  if (!isJwtSecretConfigured) {
    return res.status(503).json({
      success: false,
      message: "Authentication is not configured. Set JWT_SECRET to at least 32 bytes.",
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
        message: "The token is invalid or has expired.",
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
        message: "Admin access is required.",
      });
    }

    try {
      const admin = db.getAdminById(sub);
      if (
        !admin
        || admin.isActive !== 1
        || admin.email !== email
        || (admin.authVersion > 0 && req.user.authVersion !== admin.authVersion)
      ) {
        return res.status(403).json({
          success: false,
          message: "The admin account is inactive or does not have access.",
        });
      }

      req.admin = admin;
      return next();
    } catch (error) {
      console.error("Failed to verify admin account:", error);
      return res.status(500).json({
        success: false,
        message: "The admin account could not be verified.",
      });
    }
  });
};

export { JWT_SECRET };
