import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { db } from "../db/db.js";
import { authenticateAdmin } from "../middleware/auth.js";

const router = express.Router();
const uploadDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../uploads/consultations",
);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 3,
    fields: 20,
    fieldSize: 8 * 1024,
    parts: 25,
    headerPairs: 100,
  },
  fileFilter: (req, file, callback) => {
    if (file.mimetype !== "image/jpeg" && file.mimetype !== "image/png") {
      return callback(new Error("Foto harus berformat JPG atau PNG."));
    }
    return callback(null, true);
  },
});

function isValidImage(file) {
  const isJpeg = file.buffer.length >= 3
    && file.buffer[0] === 0xff
    && file.buffer[1] === 0xd8
    && file.buffer[2] === 0xff;
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const isPng = file.buffer.length >= pngSignature.length
    && file.buffer.subarray(0, pngSignature.length).equals(pngSignature);

  if (file.mimetype === "image/jpeg") return isJpeg;
  if (file.mimetype === "image/png") return isPng;
  return false;
}

function validateConsultation(body, product) {
  const errors = {};
  const value = (field) => String(body[field] || "").trim();
  const fullName = value("fullName");
  const phone = value("phone").replace(/[()\s-]/g, "");
  const email = value("email");
  const city = value("city");
  const donorMotor = value("donorMotor");
  const budgetRange = value("budgetRange");
  const requirements = value("requirements");
  const buildName = value("buildName");
  const buildCode = value("buildCode");
  const basis = value("basis");
  const referenceMotorId = value("referenceMotorId");

  if (!fullName) errors.fullName = "Masukkan nama lengkap.";
  else if (fullName.length > 100) errors.fullName = "Nama maksimal 100 karakter.";

  if (!phone) errors.phone = "Masukkan nomor WhatsApp.";
  else if (!/^\+?\d{8,15}$/.test(phone)) {
    errors.phone = "Gunakan 8–15 digit; tanda + di depan boleh digunakan.";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.email = "Masukkan alamat email yang valid.";
  } else if (email.length > 254) {
    errors.email = "Email terlalu panjang.";
  }

  if (!city) errors.city = "Masukkan kota domisili.";
  else if (city.length > 100) errors.city = "Kota maksimal 100 karakter.";

  if (!donorMotor) errors.donorMotor = "Pilih atau jelaskan motor donor.";
  else if (donorMotor.length > 160) errors.donorMotor = "Motor donor maksimal 160 karakter.";

  if (!budgetRange) errors.budgetRange = "Masukkan kisaran anggaran.";
  else if (budgetRange.length > 100) errors.budgetRange = "Kisaran anggaran maksimal 100 karakter.";

  if (!requirements) errors.requirements = "Ceritakan kebutuhan build.";
  else if (requirements.length < 10) errors.requirements = "Jelaskan kebutuhan build dengan minimal 10 karakter.";
  else if (requirements.length > 5000) errors.requirements = "Cerita build maksimal 5.000 karakter.";

  if (!product) errors.productId = "Produk referensi tidak ditemukan. Buka kembali detail motor.";
  if (body.consent !== "true") errors.consent = "Persetujuan untuk dihubungi wajib diberikan.";

  if (buildName.length > 100) errors.buildName = "Nama build tidak valid.";
  if (buildCode.length > 40) errors.buildCode = "Kode build tidak valid.";
  if (basis.length > 120) errors.basis = "Basis motor tidak valid.";
  if (referenceMotorId.length > 100) {
    errors.referenceMotorId = "Motor referensi tidak valid.";
  }

  return {
    errors,
    values: {
      fullName,
      phone,
      email,
      city,
      donorMotor,
      budgetRange,
      requirements,
      buildName,
      buildCode,
      basis,
      referenceMotorId,
    },
  };
}

router.get("/", authenticateAdmin, (req, res) => {
  const name = String(req.query.name || "").trim();
  const phone = String(req.query.phone || "").trim();
  const productId = String(req.query.productId || "").trim();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 10);
  const sort = String(req.query.sort || "desc");

  if (
    name.length > 100
    || phone.length > 20
    || productId.length > 100
    || !Number.isSafeInteger(page)
    || page < 1
    || !Number.isSafeInteger(pageSize)
    || pageSize < 1
    || pageSize > 50
    || !["asc", "desc"].includes(sort)
  ) {
    return res.status(400).json({
      success: false,
      message: "Filter atau pagination konsultasi tidak valid.",
    });
  }

  try {
    return res.json({
      success: true,
      data: db.getConsultations({ name, phone, productId, page, pageSize, sort }),
    });
  } catch (error) {
    console.error("Gagal memuat daftar konsultasi:", error);
    return res.status(500).json({
      success: false,
      message: "Daftar konsultasi belum dapat dimuat.",
    });
  }
});

router.get("/:id/photos/:index", authenticateAdmin, async (req, res) => {
  const index = Number(req.params.index);
  if (!Number.isSafeInteger(index) || index < 0) {
    return res.status(400).json({ success: false, message: "Foto tidak valid." });
  }

  try {
    const storedPath = db.getConsultationPhotoPath(req.params.id, index);
    if (!storedPath) {
      return res.status(404).json({ success: false, message: "Foto konsultasi tidak ditemukan." });
    }

    const prefix = "/uploads/consultations/";
    const filename = storedPath.startsWith(prefix) ? storedPath.slice(prefix.length) : "";
    if (!filename || filename !== path.basename(filename)) {
      return res.status(404).json({ success: false, message: "Foto konsultasi tidak ditemukan." });
    }

    const filePath = path.resolve(uploadDirectory, filename);
    if (!filePath.startsWith(`${uploadDirectory}${path.sep}`)) {
      return res.status(404).json({ success: false, message: "Foto konsultasi tidak ditemukan." });
    }

    const contentType = path.extname(filename).toLowerCase() === ".png"
      ? "image/png"
      : path.extname(filename).toLowerCase() === ".jpg"
        ? "image/jpeg"
        : "";
    if (!contentType) {
      return res.status(404).json({ success: false, message: "Foto konsultasi tidak ditemukan." });
    }

    return res.sendFile(filePath, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
      setHeaders: (response) => response.setHeader("Content-Type", contentType),
    }, (error) => {
      if (error && !res.headersSent) {
        res.status(error.code === "ENOENT" ? 404 : 500).json({
          success: false,
          message: error.code === "ENOENT"
            ? "Foto konsultasi tidak ditemukan."
            : "Foto konsultasi belum dapat dimuat.",
        });
      } else if (error) {
        console.error("Gagal mengirim foto konsultasi:", error);
      }
    });
  } catch (error) {
    console.error("Gagal memuat foto konsultasi:", error);
    return res.status(500).json({
      success: false,
      message: "Foto konsultasi belum dapat dimuat.",
    });
  }
});

router.get("/:id", authenticateAdmin, (req, res) => {
  try {
    const consultation = db.getConsultationById(req.params.id);
    if (!consultation) {
      return res.status(404).json({ success: false, message: "Permintaan konsultasi tidak ditemukan." });
    }
    return res.json({ success: true, data: consultation });
  } catch (error) {
    console.error("Gagal memuat detail konsultasi:", error);
    return res.status(500).json({
      success: false,
      message: "Detail konsultasi belum dapat dimuat.",
    });
  }
});

router.patch("/:id/status", authenticateAdmin, (req, res) => {
  const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
  if (!status || status.length > 40) {
    return res.status(400).json({
      success: false,
      message: "Status konsultasi tidak valid.",
    });
  }

  try {
    if (!db.getConsultationById(req.params.id)) {
      return res.status(404).json({ success: false, message: "Permintaan konsultasi tidak ditemukan." });
    }
    const result = db.updateConsultationStatus(req.params.id, status);
    if (result?.invalidStatus) {
      return res.status(400).json({
        success: false,
        message: "Pilih status yang sudah digunakan pada permintaan konsultasi.",
        allowedStatuses: result.allowedStatuses,
      });
    }
    if (!result) {
      return res.status(404).json({ success: false, message: "Permintaan konsultasi tidak ditemukan." });
    }
    return res.json({
      success: true,
      message: "Status konsultasi berhasil diperbarui.",
      data: result,
    });
  } catch (error) {
    console.error("Gagal memperbarui status konsultasi:", error);
    return res.status(500).json({
      success: false,
      message: "Status konsultasi belum dapat diperbarui.",
    });
  }
});

router.post("/", (req, res, next) => {
  upload.array("photos", 3)(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      const tooMany = error.code === "LIMIT_FILE_COUNT";
      const message = tooLarge
        ? "Setiap foto maksimal berukuran 5 MB."
        : tooMany
          ? "Maksimal 3 foto dapat dikirim."
          : "Lampiran tidak valid. Pilih maksimal 3 foto JPG atau PNG.";
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        message,
        errors: { photos: message },
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Foto tidak dapat diproses.",
      errors: { photos: error.message || "Pilih foto JPG atau PNG." },
    });
  });
}, async (req, res) => {
  const body = req.body || {};
  const productId = String(body.productId || "").trim();
  const product = productId ? db.getProductById(productId) : null;
  const { errors, values } = validateConsultation(body, product);
  const photos = req.files || [];

  let referenceMotor = null;
  if (values.referenceMotorId) {
    referenceMotor = db.getProductById(values.referenceMotorId);
    if (!referenceMotor) {
      errors.referenceMotorId = "Motor referensi tidak ditemukan. Pilih motor lain dari katalog.";
    } else if (String(referenceMotor.stockStatus || "").toLowerCase() !== "tersedia") {
      errors.referenceMotorId = "Motor referensi sudah tidak aktif di katalog. Pilih motor lain.";
    }
  }

  for (const photo of photos) {
    if (!isValidImage(photo)) {
      errors.photos = `${photo.originalname || "Foto"} bukan berkas JPG atau PNG yang valid.`;
      break;
    }
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({
      success: false,
      message: "Periksa kembali data konsultasi yang ditandai.",
      errors,
    });
  }

  const id = randomUUID();
  const savedFiles = [];
  try {
    await fs.mkdir(uploadDirectory, { recursive: true });

    for (const photo of photos) {
      const extension = photo.mimetype === "image/png" ? ".png" : ".jpg";
      const filename = `consultation-${id}-${randomUUID()}${extension}`;
      const filePath = path.join(uploadDirectory, filename);
      await fs.writeFile(filePath, photo.buffer, { flag: "wx" });
      savedFiles.push({
        filePath,
        publicPath: `/uploads/consultations/${filename}`,
      });
    }

    const stored = db.createConsultation({
      id,
      ...values,
      productId: product.id,
      productName: product.name,
      categoryName: product.categoryName,
      basis: product.basis || values.basis,
      price: product.price,
      referenceMotor,
      referenceImages: savedFiles.map((file) => file.publicPath),
    });

    return res.status(201).json({
      success: true,
      message: "Permintaan konsultasi berhasil disimpan.",
      data: stored,
    });
  } catch (error) {
    for (const file of savedFiles) {
      try {
        await fs.unlink(file.filePath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error("Gagal membersihkan foto konsultasi yang tidak tersimpan:", cleanupError);
        }
      }
    }
    console.error("Gagal menyimpan permintaan konsultasi:", error);
    return res.status(500).json({
      success: false,
      message: "Permintaan belum tersimpan. Data formulir tetap tersedia; silakan coba lagi.",
    });
  }
});

export default router;
