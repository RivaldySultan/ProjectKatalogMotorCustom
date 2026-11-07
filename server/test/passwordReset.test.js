import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import jwt from "jsonwebtoken";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "katalog-password-reset-"));
process.env.KATALOG_DB_PATH = path.join(temporaryDirectory, "test.sqlite");
const legacyDatabase = new DatabaseSync(process.env.KATALOG_DB_PATH);
legacyDatabase.exec(`
  CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    privacy_consent_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
legacyDatabase.prepare(`
  INSERT INTO customers (id, full_name, email, phone, password_hash, privacy_consent_at)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`).run("legacy-schema-customer", "Legacy Customer", "legacy-schema@example.test", "6281234567890", "existing-password-hash");
legacyDatabase.close();
process.env.JWT_SECRET = "test-jwt-secret-with-at-least-32-bytes";
process.env.PASSWORD_RESET_SECRET = "test-reset-secret-with-at-least-32-bytes";

const { db } = await import("../src/db/db.js");
const authRoutes = (await import("../src/routes/auth.js")).default;
const customerRoutes = (await import("../src/routes/customers.js")).default;
const purchaseRoutes = (await import("../src/routes/purchases.js")).default;
const express = (await import("express")).default;
const bcrypt = (await import("bcryptjs")).default;
let httpServer;

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/purchases", purchaseRoutes);
httpServer = app.listen(0, "127.0.0.1");
await once(httpServer, "listening");
const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

after(async () => {
  await new Promise((resolve, reject) => {
    httpServer.close((error) => error ? reject(error) : resolve());
  });
  db.db.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function post(route, body, headers = {}) {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("existing customer accounts survive the security-question schema migration", () => {
  const legacyCustomer = db.getCustomerByEmail("legacy-schema@example.test");
  assert.equal(legacyCustomer.id, "legacy-schema-customer");
  assert.equal(legacyCustomer.fullName, "Legacy Customer");
  assert.equal(legacyCustomer.passwordHash, "existing-password-hash");
  assert.equal(legacyCustomer.securityQuestion, null);
  assert.equal(legacyCustomer.securityAnswerHash, null);
});

test("WhatsApp recovery endpoints are no longer available", async () => {
  assert.equal((await post("/api/customers/forgot-password", { phone: "081222222222" })).status, 404);
  assert.equal((await post("/api/customers/reset-password", { token: "not-a-token" })).status, 404);
  assert.equal((await post("/api/auth/forgot-password", { phone: "081111111111" })).status, 404);
  assert.equal((await post("/api/auth/reset-password", {})).status, 404);
});

test("security questions protect recovery, support legacy accounts, and rate-limit failures", async () => {
  db.db.prepare(`
    INSERT INTO admins (id, name, email, password, phone, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run("admin-test", "Test Admin", "admin@example.test", await bcrypt.hash("admin-password", 10), "6281111111111");
  db.createCustomer({
    id: "customer-test",
    fullName: "Legacy Test Customer",
    email: "customer@example.test",
    phone: "6281222222222",
    passwordHash: await bcrypt.hash("new-customer-password", 10),
  });

  const parallelCustomer = db.createCustomer({
    id: "customer-parallel-recovery",
    fullName: "Parallel Recovery",
    email: "parallel-recovery@example.test",
    phone: "6281444444444",
    passwordHash: await bcrypt.hash("some-password", 10),
    securityQuestion: "birth_city",
    securityAnswerHash: await bcrypt.hash("bandung", 10),
  });
  const parallelAttempts = await Promise.all(Array.from({ length: 8 }, () => post(
    "/api/customers/forgot-password/verify",
    {
      email: parallelCustomer.email,
      questionId: "birth_city",
      answer: "wrong answer",
    },
    { "X-Forwarded-For": "198.51.100.40" },
  )));
  assert.ok(parallelAttempts.every((response) => response.status === 400));
  const lockedAccountAttempts = db.db.prepare(`
    SELECT attempts, locked_until AS lockedUntil
    FROM customer_password_reset_attempts
    WHERE attempts = 5 AND locked_until IS NOT NULL
  `).all();
  assert.equal(lockedAccountAttempts.length, 1);

  const missingQuestion = await post("/api/customers/register", {
    fullName: "Security Customer",
    email: "security-customer@example.test",
    phone: "081555555555",
    password: "old-security-password",
    confirmPassword: "old-security-password",
    privacyConsent: true,
  });
  assert.equal(missingQuestion.status, 400);

  const registration = await post("/api/customers/register", {
    fullName: "Security Customer",
    email: "security-customer@example.test",
    phone: "081555555555",
    password: "old-security-password",
    confirmPassword: "old-security-password",
    securityQuestion: "first_pet",
    securityAnswer: "Blue   Fox",
    privacyConsent: true,
  });
  assert.equal(registration.status, 201);
  const registeredCookie = registration.headers.get("set-cookie").split(";")[0];
  const newCustomer = db.getCustomerByEmail("security-customer@example.test");
  assert.equal(newCustomer.securityQuestion, "first_pet");
  assert.notEqual(newCustomer.securityAnswerHash, "blue fox");
  assert.equal(await bcrypt.compare("blue fox", newCustomer.securityAnswerHash), true);
  assert.equal(Object.hasOwn((await registration.json()).data, "securityAnswerHash"), false);

  const legacyLogin = await post("/api/customers/login", {
    email: "customer@example.test",
    password: "new-customer-password",
  });
  assert.equal(legacyLogin.status, 200);
  const legacyCookie = legacyLogin.headers.get("set-cookie").split(";")[0];
  const legacyQuestion = await fetch(`${baseUrl}/api/customers/me/security-question`, {
    headers: { Cookie: legacyCookie },
  });
  assert.equal((await legacyQuestion.json()).data.securityQuestion, null);

  const wrongCurrentPassword = await fetch(`${baseUrl}/api/customers/me/security-question`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: legacyCookie },
    body: JSON.stringify({
      currentPassword: "incorrect-password",
      securityQuestion: "birth_city",
      securityAnswer: "Jakarta",
    }),
  });
  assert.equal(wrongCurrentPassword.status, 401);

  const enrollLegacy = await fetch(`${baseUrl}/api/customers/me/security-question`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: legacyCookie },
    body: JSON.stringify({
      currentPassword: "new-customer-password",
      securityQuestion: "birth_city",
      securityAnswer: "Jakarta",
    }),
  });
  assert.equal(enrollLegacy.status, 200);
  assert.equal(db.getCustomerByEmail("customer@example.test").securityQuestion, "birth_city");

  const unknownAccount = await post("/api/customers/forgot-password/verify", {
    email: "unknown-security@example.test",
    questionId: "first_pet",
    answer: "blue fox",
  });
  const wrongAnswer = await post("/api/customers/forgot-password/verify", {
    email: "security-customer@example.test",
    questionId: "first_pet",
    answer: "wrong answer",
  });
  assert.equal(unknownAccount.status, 400);
  assert.equal(wrongAnswer.status, 400);
  const genericFailure = await wrongAnswer.json();
  assert.deepEqual(await unknownAccount.json(), genericFailure);

  const wrongQuestion = await post("/api/customers/forgot-password/verify", {
    email: "security-customer@example.test",
    questionId: "birth_city",
    answer: "blue fox",
  });
  assert.equal(wrongQuestion.status, 400);

  const verified = await post("/api/customers/forgot-password/verify", {
    email: "security-customer@example.test",
    questionId: "first_pet",
    answer: " Blue Fox ",
  });
  assert.equal(verified.status, 200);
  const resetToken = (await verified.json()).data.resetToken;
  assert.match(resetToken, /^[A-Za-z0-9_-]{43}$/);

  const bypass = await post("/api/customers/forgot-password/reset", {
    password: "reset-security-password",
    confirmPassword: "reset-security-password",
  });
  assert.equal(bypass.status, 400);
  assert.equal((await post("/api/customers/login", {
    email: "security-customer@example.test",
    password: "old-security-password",
  })).status, 200);

  const mismatch = await post("/api/customers/forgot-password/reset", {
    resetToken,
    password: "reset-security-password",
    confirmPassword: "different-password",
  });
  assert.equal(mismatch.status, 400);
  const reset = await post("/api/customers/forgot-password/reset", {
    resetToken,
    password: "reset-security-password",
    confirmPassword: "reset-security-password",
  });
  assert.equal(reset.status, 200);
  const revokedSession = await fetch(`${baseUrl}/api/customers/me`, {
    headers: { Cookie: registeredCookie },
  });
  assert.equal(revokedSession.status, 401);
  assert.equal((await post("/api/customers/login", {
    email: "security-customer@example.test",
    password: "old-security-password",
  })).status, 401);
  assert.equal((await post("/api/customers/login", {
    email: "security-customer@example.test",
    password: "reset-security-password",
  })).status, 200);
  assert.equal((await post("/api/customers/forgot-password/reset", {
    resetToken,
    password: "another-security-password",
    confirmPassword: "another-security-password",
  })).status, 400);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await post("/api/customers/forgot-password/verify", {
      email: "security-customer@example.test",
      questionId: "first_pet",
      answer: "wrong answer",
    });
    assert.equal(failed.status, 400);
    assert.equal((await failed.json()).message, genericFailure.message);
  }
  const locked = await post("/api/customers/forgot-password/verify", {
    email: "security-customer@example.test",
    questionId: "first_pet",
    answer: "blue fox",
  });
  assert.equal(locked.status, 400);
  assert.deepEqual(await locked.json(), genericFailure);
});

test("order chat is available only to the order customer or an admin", async () => {
  const accessToken = "ab".repeat(32);
  db.db.prepare(`
    INSERT INTO purchase_orders (
      id, order_number, idempotency_key, request_hash, access_token_hash,
      customer_id, product_id, product_name, build_name, purchase_type,
      basis, category_name, specifications, price_snapshot, shipping_method,
      total_amount, customer_name, phone, city, payment_method, order_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "chat-order-test",
    "RM-CHAT-TEST",
    "idempotency-chat-test",
    "request-hash",
    createHash("sha256").update(accessToken).digest("hex"),
    "customer-test",
    "prod_1",
    "Test Bike",
    "Test Build",
    "made_to_order",
    "Test basis",
    "Test category",
    "[]",
    100000,
    "pickup",
    100000,
    "Test Customer",
    "6282222222222",
    "Jakarta",
    "gopay",
    "awaiting_payment",
  );

  const invalidMessage = await post("/api/purchases/chat-order-test/messages", { message: "  " }, {
    "X-Order-Access-Token": accessToken,
  });
  assert.equal(invalidMessage.status, 400);

  const customerLogin = await post("/api/customers/login", {
    email: "customer@example.test",
    password: "new-customer-password",
  });
  assert.equal(customerLogin.status, 200);
  const customerCookie = customerLogin.headers.get("set-cookie").split(";")[0];
  const customerMessage = await post("/api/purchases/chat-order-test/messages", {
    message: "Can I ask about this motorcycle?",
  }, {
    Cookie: customerCookie,
    "X-Order-Access-Token": accessToken,
  });
  assert.equal(customerMessage.status, 201);
  assert.equal((await customerMessage.json()).data.actorType, "customer");

  const accountMessages = await fetch(`${baseUrl}/api/purchases/chat-order-test/messages`, {
    headers: { Cookie: customerCookie },
  });
  assert.equal(accountMessages.status, 200);
  const accountMessage = await post("/api/purchases/chat-order-test/messages", {
    message: "I am asking from my customer account.",
  }, { Cookie: customerCookie });
  assert.equal(accountMessage.status, 201);

  const unauthorized = await fetch(`${baseUrl}/api/purchases/chat-order-test/messages`, {
    headers: { "X-Order-Access-Token": "cd".repeat(32) },
  });
  assert.equal(unauthorized.status, 404);

  const admin = db.getAdminById("admin-test");
  const adminToken = jwt.sign({
    email: admin.email,
    role: "admin",
    authVersion: admin.authVersion,
  }, process.env.JWT_SECRET, { subject: admin.id, expiresIn: "1h" });
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const adminMessage = await post("/api/purchases/admin/chat-order-test/messages", {
    message: "Yes, this model is available for discussion.",
  }, adminHeaders);
  assert.equal(adminMessage.status, 201);
  assert.equal((await adminMessage.json()).data.actorType, "admin");

  const customerMessages = await fetch(`${baseUrl}/api/purchases/chat-order-test/messages`, {
    headers: { "X-Order-Access-Token": accessToken },
  });
  assert.equal(customerMessages.status, 200);
  const messages = (await customerMessages.json()).data.messages;
  assert.equal(messages.length, 3);
  assert.deepEqual(messages.map(({ actorType }) => actorType), ["customer", "customer", "admin"]);

  const adminMessages = await fetch(`${baseUrl}/api/purchases/admin/chat-order-test/messages`, {
    headers: adminHeaders,
  });
  assert.equal(adminMessages.status, 200);
  assert.equal((await adminMessages.json()).data.messages.length, 3);
});
