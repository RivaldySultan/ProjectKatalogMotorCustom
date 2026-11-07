import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "katalog-password-reset-"));
process.env.KATALOG_DB_PATH = path.join(temporaryDirectory, "test.sqlite");
process.env.JWT_SECRET = "test-jwt-secret-with-at-least-32-bytes";
process.env.PASSWORD_RESET_SECRET = "test-reset-secret-with-at-least-32-bytes";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_ACCESS_TOKEN = "test-access-token";
process.env.WHATSAPP_OTP_TEMPLATE = "password_reset_otp";
process.env.WHATSAPP_OTP_LANGUAGE = "id";

const { db } = await import("../src/db/db.js");
const authRoutes = (await import("../src/routes/auth.js")).default;
const customerRoutes = (await import("../src/routes/customers.js")).default;
const {
  finishPasswordReset,
  normalizeWhatsAppNumber,
} = await import("../src/services/passwordResetService.js");
const express = (await import("express")).default;
const bcrypt = (await import("bcryptjs")).default;
const originalFetch = globalThis.fetch;
const messages = [];
let failDelivery = false;
let httpServer;

globalThis.fetch = async (input, options) => {
  if (String(input).startsWith("https://graph.facebook.com/")) {
    if (failDelivery) return { ok: false, status: 503 };
    messages.push(JSON.parse(options.body));
    return { ok: true, status: 200 };
  }
  return originalFetch(input, options);
};

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
httpServer = app.listen(0, "127.0.0.1");
await once(httpServer, "listening");
const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

after(async () => {
  await new Promise((resolve, reject) => {
    httpServer.close((error) => error ? reject(error) : resolve());
  });
  db.db.close();
  globalThis.fetch = originalFetch;
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function post(route, body, headers = {}) {
  return originalFetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("admin and customer password resets use a WhatsApp OTP once and revoke sessions", async () => {
  assert.equal(normalizeWhatsAppNumber("0812 3456 7890"), "6281234567890");
  assert.equal(normalizeWhatsAppNumber("+1 (415) 555-2671"), "14155552671");
  assert.equal(normalizeWhatsAppNumber("invalid"), "");

  db.db.prepare(`
    INSERT INTO admins (id, name, email, password, phone, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run("admin-test", "Test Admin", "admin@example.test", await bcrypt.hash("old-admin-password", 10), "6281111111111");

  const customer = db.createCustomer({
    id: "customer-test",
    fullName: "Test Customer",
    email: "customer@example.test",
    phone: normalizeWhatsAppNumber("081222222222"),
    passwordHash: await bcrypt.hash("old-customer-password", 10),
  });
  db.createCustomerSession({
    id: "customer-old-session",
    customerId: customer.id,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const adminLogin = await post("/api/auth/login", {
    email: "admin@example.test",
    password: "old-admin-password",
  });
  assert.equal(adminLogin.status, 200);
  const oldAdminToken = (await adminLogin.json()).token;

  const adminRequest = await post("/api/auth/forgot-password", { phone: "+62 811 1111 1111" });
  assert.equal(adminRequest.status, 202);
  assert.equal(messages.length, 1);
  const adminOtp = messages[0].template.components[0].parameters[0].text;
  assert.match(adminOtp, /^\d{6}$/);
  const storedOtp = db.db.prepare(`
    SELECT code_hash AS codeHash FROM password_reset_otps WHERE account_id = ?
  `).get("admin-test");
  assert.notEqual(storedOtp.codeHash, adminOtp);

  const throttledAdminRequest = await post("/api/auth/forgot-password", { phone: "081111111111" });
  assert.equal(throttledAdminRequest.status, 202);
  assert.equal(messages.length, 1);

  const wrongAdminOtp = await post("/api/auth/reset-password", {
    phone: "081111111111",
    otp: adminOtp === "000000" ? "000001" : "000000",
    password: "new-admin-password",
  });
  assert.equal(wrongAdminOtp.status, 400);

  const adminReset = await post("/api/auth/reset-password", {
    phone: "081111111111",
    otp: adminOtp,
    password: "new-admin-password",
  });
  assert.equal(adminReset.status, 200);

  const staleAdminSession = await originalFetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${oldAdminToken}` },
  });
  assert.equal(staleAdminSession.status, 403);
  const newAdminLogin = await post("/api/auth/login", {
    email: "admin@example.test",
    password: "new-admin-password",
  });
  assert.equal(newAdminLogin.status, 200);

  const customerRequest = await post("/api/customers/forgot-password", { phone: "081222222222" });
  assert.equal(customerRequest.status, 202);
  const customerOtp = messages[1].template.components[0].parameters[0].text;
  assert.match(customerOtp, /^\d{6}$/);
  const customerSession = await post("/api/customers/login", {
    email: customer.email,
    password: "old-customer-password",
  });
  assert.equal(customerSession.status, 200);
  const customerCookie = customerSession.headers.get("set-cookie").split(";")[0];

  const customerReset = await post("/api/customers/reset-password", {
    phone: "081222222222",
    otp: customerOtp,
    password: "new-customer-password",
    confirmPassword: "new-customer-password",
  });
  assert.equal(customerReset.status, 200);
  const revokedSession = await originalFetch(`${baseUrl}/api/customers/me`, {
    headers: { Cookie: customerCookie },
  });
  assert.equal(revokedSession.status, 401);
  const newCustomerLogin = await post("/api/customers/login", {
    email: customer.email,
    password: "new-customer-password",
  });
  assert.equal(newCustomerLogin.status, 200);

  const reusedOtp = await post("/api/customers/reset-password", {
    phone: "081222222222",
    otp: customerOtp,
    password: "another-new-password",
    confirmPassword: "another-new-password",
  });
  assert.equal(reusedOtp.status, 400);
});

test("unknown numbers do not send a code and provider failures are reported", async () => {
  const unknownAccount = await post("/api/customers/forgot-password", { phone: "081299999999" });
  assert.equal(unknownAccount.status, 202);
  assert.equal(messages.length, 2);

  db.createCustomer({
    id: "customer-failing-delivery",
    fullName: "Delivery Failure",
    email: "delivery-failure@example.test",
    phone: normalizeWhatsAppNumber("081333333333"),
    passwordHash: await bcrypt.hash("some-password", 10),
  });
  const failingPhone = normalizeWhatsAppNumber("081333333333");
  assert.equal(db.getActiveCustomersByPhone(failingPhone).length, 1);
  assert.equal(
    db.getPasswordResetForPhone(failingPhone, new Date(Date.now() - 60_000).toISOString()),
    undefined,
  );
  failDelivery = true;
  const deliveryFailure = await post("/api/customers/forgot-password", { phone: failingPhone });
  assert.equal(deliveryFailure.status, 502);
  const failedOtp = db.db.prepare(`
    SELECT consumed_at AS consumedAt FROM password_reset_otps
    WHERE account_id = ? ORDER BY created_at DESC LIMIT 1
  `).get("customer-failing-delivery");
  assert.ok(failedOtp.consumedAt);
  failDelivery = false;
});

test("expired codes and codes with five incorrect attempts cannot reset a password", async () => {
  const expiredPhone = normalizeWhatsAppNumber("086666666666");
  const expiredCustomer = db.createCustomer({
    id: "customer-expired-code",
    fullName: "Expired Code",
    email: "expired-code@example.test",
    phone: expiredPhone,
    passwordHash: await bcrypt.hash("some-password", 10),
  });
  const expiredRequest = await post("/api/customers/forgot-password", { phone: expiredPhone });
  assert.equal(expiredRequest.status, 202);
  const expiredOtp = messages.at(-1).template.components[0].parameters[0].text;
  db.db.prepare(`
    UPDATE password_reset_otps SET expires_at = ?
    WHERE account_id = ?
  `).run(new Date(Date.now() - 1000).toISOString(), expiredCustomer.id);
  assert.equal(finishPasswordReset({
    accountType: "customer",
    accountId: expiredCustomer.id,
    phone: expiredPhone,
    otp: expiredOtp,
    passwordHash: "not-used",
  }), "expired");

  const lockedPhone = normalizeWhatsAppNumber("087777777777");
  const lockedCustomer = db.createCustomer({
    id: "customer-locked-code",
    fullName: "Locked Code",
    email: "locked-code@example.test",
    phone: lockedPhone,
    passwordHash: await bcrypt.hash("some-password", 10),
  });
  const lockedRequest = await post("/api/customers/forgot-password", { phone: lockedPhone });
  assert.equal(lockedRequest.status, 202);
  const correctOtp = messages.at(-1).template.components[0].parameters[0].text;
  const wrongOtp = correctOtp === "000000" ? "000001" : "000000";

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = finishPasswordReset({
      accountType: "customer",
      accountId: lockedCustomer.id,
      phone: lockedPhone,
      otp: wrongOtp,
      passwordHash: "not-used",
    });
    assert.equal(result, attempt === 5 ? "locked" : "invalid");
  }
  assert.equal(finishPasswordReset({
    accountType: "customer",
    accountId: lockedCustomer.id,
    phone: lockedPhone,
    otp: correctOtp,
    passwordHash: "not-used",
  }), "invalid");
});
