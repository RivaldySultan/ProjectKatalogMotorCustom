import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../db/db.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "Admin Ruka";

if (!email || !password) {
  console.error("Atur ADMIN_EMAIL dan ADMIN_PASSWORD di server/.env terlebih dahulu.");
  process.exitCode = 1;
} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("ADMIN_EMAIL harus berisi alamat email yang valid.");
  process.exitCode = 1;
} else if (
  Buffer.byteLength(password, "utf8") < 8 ||
  Buffer.byteLength(password, "utf8") > 72
) {
  console.error("ADMIN_PASSWORD harus 8–72 byte agar kompatibel dengan bcrypt.");
  process.exitCode = 1;
} else if (
  !process.env.JWT_SECRET ||
  Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32
) {
  console.error("Atur JWT_SECRET acak minimal 32 byte di server/.env.");
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
      created: "Akun admin berhasil dibuat.",
      updated: "Akun admin yang ada berhasil diperbarui.",
      unchanged: "Akun admin sudah sesuai; tidak ada perubahan.",
    }[result];
    console.log(message);
  } catch (error) {
    console.error(`Setup akun admin gagal: ${error.message}`);
    process.exitCode = 1;
  }
}

db.db.close();
