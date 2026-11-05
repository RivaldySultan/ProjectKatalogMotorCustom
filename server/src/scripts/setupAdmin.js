import "../loadEnv.js";
import { randomUUID } from "node:crypto";
import { db } from "../db/db.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "Admin Ruka";

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env first.");
  process.exitCode = 1;
} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("ADMIN_EMAIL must contain a valid email address.");
  process.exitCode = 1;
} else if (
  Buffer.byteLength(password, "utf8") < 8 ||
  Buffer.byteLength(password, "utf8") > 72
) {
  console.error("ADMIN_PASSWORD must be 8–72 bytes to be compatible with bcrypt.");
  process.exitCode = 1;
} else if (
  !process.env.JWT_SECRET ||
  Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32
) {
  console.error("Set a random JWT_SECRET of at least 32 bytes in server/.env.");
  process.exitCode = 1;
} else {
  try {
    const result = db.bootstrapAdmin({
      id: `admin_${randomUUID()}`,
      name,
      email,
      password,
    });

    const message = {
      created: "Admin account created.",
      updated: "Existing admin account updated.",
      unchanged: "Admin account is already up to date; no changes made.",
    }[result];
    console.log(message);
  } catch (error) {
    console.error(`Admin setup failed: ${error.message}`);
    process.exitCode = 1;
  }
}

db.db.close();
