import { createHmac, randomInt, randomUUID } from "node:crypto";
import { db } from "../db/db.js";

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_WAIT_MS = 60 * 1000;

export function normalizeWhatsAppNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const international = digits.startsWith("00")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? `62${digits.slice(1)}`
      : digits;
  return /^\d{10,15}$/.test(international) ? international : "";
}

export function isWhatsAppOtpConfigured() {
  const resetSecret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID
    && process.env.WHATSAPP_ACCESS_TOKEN
    && /^[a-zA-Z0-9_]{1,512}$/.test(process.env.WHATSAPP_OTP_TEMPLATE || "")
    && resetSecret
    && Buffer.byteLength(resetSecret, "utf8") >= 32,
  );
}

function hashOtp(otp) {
  const secret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Password reset signing secret is not securely configured.");
  }
  return createHmac("sha256", secret).update(otp, "utf8").digest("hex");
}

async function sendWhatsAppOtp(phone, otp) {
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error("WhatsApp API version is invalid.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "template",
        template: {
          name: process.env.WHATSAPP_OTP_TEMPLATE,
          language: { code: process.env.WHATSAPP_OTP_LANGUAGE || "id" },
          components: [{
            type: "body",
            parameters: [{ type: "text", text: otp }],
          }],
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`WhatsApp provider returned HTTP ${response.status}.`);
  }
}

export async function sendPasswordResetOtp({ accountType, accountId, phone }) {
  const recentRequest = db.getPasswordResetForPhone(
    phone,
    new Date(Date.now() - RESEND_WAIT_MS).toISOString(),
  );
  if (recentRequest) return false;

  const otp = randomInt(0, 1000000).toString().padStart(6, "0");
  const resetId = randomUUID();
  db.createPasswordResetOtp({
    id: resetId,
    accountType,
    accountId,
    phone,
    codeHash: hashOtp(otp),
    expiresAt: new Date(Date.now() + OTP_LIFETIME_MS).toISOString(),
  });

  try {
    await sendWhatsAppOtp(phone, otp);
  } catch (error) {
    db.invalidatePasswordResetOtp(resetId);
    throw error;
  }
  return true;
}

export function finishPasswordReset({ accountType, accountId, phone, otp, passwordHash }) {
  return db.completePasswordReset({
    accountType,
    accountId,
    phone,
    codeHash: hashOtp(otp),
    passwordHash,
  });
}
