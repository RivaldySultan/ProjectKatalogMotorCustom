import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "katalog-consultation-chat-"));
process.env.KATALOG_DB_PATH = path.join(temporaryDirectory, "test.sqlite");
process.env.JWT_SECRET = "test-jwt-secret-with-at-least-32-bytes";

const { db } = await import("../src/db/db.js");
const consultationRoutes = (await import("../src/routes/consultations.js")).default;
const customerRoutes = (await import("../src/routes/customers.js")).default;
const express = (await import("express")).default;

const customerId = "consultation-chat-customer";
const customerSessionId = randomUUID();
const customerToken = jwt.sign(
  { role: "customer" },
  process.env.JWT_SECRET,
  { subject: customerId, jwtid: customerSessionId, expiresIn: "1h" },
);
const adminId = "consultation-chat-admin";
const adminToken = jwt.sign(
  { email: "consultation-admin@example.test", role: "admin" },
  process.env.JWT_SECRET,
  { subject: adminId, expiresIn: "1h" },
);

db.createCustomer({
  id: customerId,
  fullName: "Consultation Customer",
  email: "consultation-customer@example.test",
  phone: "6281234567890",
  passwordHash: "test-password-hash",
});
db.createCustomerSession({
  id: customerSessionId,
  customerId,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
});
db.db.prepare(`
  INSERT INTO admins (id, name, email, password)
  VALUES (?, ?, ?, ?)
`).run(adminId, "Consultation Admin", "consultation-admin@example.test", "test-password-hash");

const app = express();
app.use(express.json());
app.use("/api/customers", customerRoutes);
app.use("/api/consultations", consultationRoutes);
const httpServer = app.listen(0, "127.0.0.1");
await once(httpServer, "listening");
const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

after(async () => {
  await new Promise((resolve, reject) => {
    httpServer.close((error) => error ? reject(error) : resolve());
  });
  db.db.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("consultation web submissions require login and customer/admin chat is shared", async () => {
  const anonymousResponse = await fetch(`${baseUrl}/api/consultations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(anonymousResponse.status, 401);

  const form = new FormData();
  form.set("fullName", "Consultation Customer");
  form.set("phone", "6281234567890");
  form.set("email", "consultation-customer@example.test");
  form.set("city", "Bandung");
  form.set("donorMotor", "I do not have a donor motorcycle");
  form.set("budgetRange", "Rp10–15 million");
  form.set("requirements", "A custom cafe racer build for daily rides.");
  form.set("consent", "true");
  form.set("productId", "prod_1");
  form.set("buildName", "The Silverline");
  form.set("buildCode", "RK-01");
  form.set("basis", "Suzuki Thunder");
  form.set("referenceMotorId", "");
  const createdResponse = await fetch(`${baseUrl}/api/consultations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${customerToken}` },
    body: form,
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  const consultationId = created.data.id;
  assert.equal(db.getConsultationCustomerId(consultationId), customerId);

  const customerMessagesUrl = `${baseUrl}/api/customers/consultations/${encodeURIComponent(consultationId)}/messages`;
  const customerMessageResponse = await fetch(customerMessagesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${customerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: "Can we discuss the seat design?" }),
  });
  assert.equal(customerMessageResponse.status, 201);

  const adminMessagesUrl = `${baseUrl}/api/consultations/${encodeURIComponent(consultationId)}/messages`;
  const adminMessageResponse = await fetch(adminMessagesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: "Yes, we can review the design together." }),
  });
  assert.equal(adminMessageResponse.status, 201);

  const messagesResponse = await fetch(customerMessagesUrl, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert.equal(messagesResponse.status, 200);
  const messages = (await messagesResponse.json()).data.messages;
  assert.deepEqual(messages.map(({ actorType, message }) => [actorType, message]), [
    ["customer", "Can we discuss the seat design?"],
    ["admin", "Yes, we can review the design together."],
  ]);
});
