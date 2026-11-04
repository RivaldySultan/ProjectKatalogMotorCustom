import jwt from "jsonwebtoken";
import { db } from "../db/db.js";
import { JWT_SECRET } from "./auth.js";

export const CUSTOMER_SESSION_COOKIE = "ruka_customer_session";

function getCustomerToken(req) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme === "Bearer" && token) return token;
  const cookie = (req.get("cookie") || "")
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${CUSTOMER_SESSION_COOKIE}=`));
  if (!cookie) return "";
  try {
    return decodeURIComponent(cookie.slice(CUSTOMER_SESSION_COOKIE.length + 1));
  } catch {
    return "";
  }
}

export function authenticateCustomer(req, res, next) {
  if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
    return res.status(503).json({
      success: false,
      message: "Autentikasi belum dikonfigurasi dengan aman.",
    });
  }
  const token = getCustomerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: "Silakan masuk ke akun pelanggan." });
  }

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Sesi pelanggan tidak valid atau telah berakhir." });
  }
  if (
    claims.role !== "customer"
    || typeof claims.sub !== "string"
    || typeof claims.jti !== "string"
  ) {
    return res.status(403).json({ success: false, message: "Akses khusus pelanggan diperlukan." });
  }

  try {
    const customer = db.getCustomerById(claims.sub);
    const session = db.getCustomerSession(claims.jti, claims.sub);
    if (
      !customer
      || customer.isActive !== 1
      || !session
      || session.revokedAt
    ) {
      return res.status(401).json({ success: false, message: "Sesi pelanggan tidak lagi aktif." });
    }
    const { passwordHash, isActive, ...profile } = customer;
    req.customer = profile;
    req.customerSessionId = claims.jti;
    return next();
  } catch (error) {
    console.error("Gagal memverifikasi sesi pelanggan:", error);
    return res.status(500).json({ success: false, message: "Sesi pelanggan belum dapat diverifikasi." });
  }
}

export function optionalCustomer(req, res, next) {
  if (!getCustomerToken(req)) return next();
  return authenticateCustomer(req, res, next);
}
