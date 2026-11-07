import { createHmac, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../db/db.js";

export const SECURITY_QUESTION_IDS = new Set([
  "childhood_nickname",
  "first_pet",
  "birth_city",
]);

const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_LOCK_MS = 15 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;
const IP_MAX_ATTEMPTS = 30;
const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
const DUMMY_ANSWER_HASH = bcrypt.hashSync("not-a-real-security-answer", 10);

export function normalizeSecurityAnswer(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id");
}

function resetSecret() {
  const secret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Password reset signing secret is not securely configured.");
  }
  return secret;
}

function hashResetValue(value) {
  return createHmac("sha256", resetSecret()).update(value, "utf8").digest("hex");
}

function getRateLimitKeys(email, ipAddress) {
  return [
    {
      subjectHash: hashResetValue(`security-reset:email:${email}`),
      maxAttempts: RESET_MAX_ATTEMPTS,
    },
    {
      subjectHash: hashResetValue(`security-reset:ip:${ipAddress || "unknown"}`),
      maxAttempts: IP_MAX_ATTEMPTS,
    },
  ];
}

export async function verifyCustomerSecurityAnswer({ email, questionId, answer, ipAddress }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const answerValue = normalizeSecurityAnswer(answer);
  const keys = getRateLimitKeys(normalizedEmail, ipAddress);

  const allowed = db.consumeCustomerPasswordResetAttempt(keys, {
    now: new Date().toISOString(),
    windowMs: RESET_WINDOW_MS,
    lockMs: RESET_LOCK_MS,
  });
  if (!allowed) {
    await bcrypt.compare(answerValue, DUMMY_ANSWER_HASH);
    return { ok: false, limited: true };
  }

  const customer = db.getCustomerSecurityQuestionByEmail(normalizedEmail);
  const answerHash = customer?.securityAnswerHash || DUMMY_ANSWER_HASH;
  const answerMatches = await bcrypt.compare(answerValue, answerHash);
  const verified = customer?.isActive === 1
    && SECURITY_QUESTION_IDS.has(customer.securityQuestion)
    && customer.securityQuestion === questionId
    && Boolean(customer.securityAnswerHash)
    && answerMatches;

  if (!verified) {
    return { ok: false, limited: false };
  }

  db.clearCustomerPasswordResetAttempts(keys);
  const token = randomBytes(32).toString("base64url");
  db.createCustomerPasswordResetChallenge({
    id: randomUUID(),
    customerId: customer.id,
    tokenHash: hashResetValue(`security-reset-token:${token}`),
    expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME_MS).toISOString(),
  });
  return { ok: true, token };
}

export function finishCustomerSecurityPasswordReset({ token, passwordHash }) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return "invalid";
  }
  return db.completeCustomerSecurityPasswordReset({
    tokenHash: hashResetValue(`security-reset-token:${token}`),
    passwordHash,
  });
}
