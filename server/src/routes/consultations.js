import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { db } from "../db/db.js";
import { authenticateAdmin } from "../middleware/auth.js";
import { authenticateCustomer } from "../middleware/customerAuth.js";

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
      return callback(new Error("Photos must be in JPG or PNG format."));
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

  if (!fullName) errors.fullName = "Enter your full name.";
  else if (fullName.length > 100) errors.fullName = "Name must not exceed 100 characters.";

  if (!phone) errors.phone = "Enter your WhatsApp number.";
  else if (!/^\+?\d{8,15}$/.test(phone)) {
    errors.phone = "Enter 8–15 digits; a leading + is optional.";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.email = "Enter a valid email address.";
  } else if (email.length > 254) {
    errors.email = "Email terlalu panjang.";
  }

  if (!city) errors.city = "Enter your city.";
  else if (city.length > 100) errors.city = "City must not exceed 100 characters.";

  if (!donorMotor) errors.donorMotor = "Select or describe your donor motorcycle.";
  else if (donorMotor.length > 160) errors.donorMotor = "Donor motorcycle details must not exceed 160 characters.";

  if (!budgetRange) errors.budgetRange = "Enter your budget range.";
  else if (budgetRange.length > 100) errors.budgetRange = "Budget range must not exceed 100 characters.";

  if (!requirements) errors.requirements = "Tell us about your build requirements.";
  else if (requirements.length < 10) errors.requirements = "Describe your build requirements in at least 10 characters.";
  else if (requirements.length > 5000) errors.requirements = "Build requirements must not exceed 5,000 characters.";

  if (!product) errors.productId = "Reference product not found. Reopen the motorcycle details.";
  if (body.consent !== "true") errors.consent = "Consent to be contacted is required.";

  if (buildName.length > 100) errors.buildName = "Invalid build name.";
  if (buildCode.length > 40) errors.buildCode = "Invalid build code.";
  if (basis.length > 120) errors.basis = "Invalid motorcycle basis.";
  if (referenceMotorId.length > 100) {
    errors.referenceMotorId = "Invalid reference motorcycle.";
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
      message: "Invalid consultation filter or pagination.",
    });
  }

  try {
    return res.json({
      success: true,
      data: db.getConsultations({ name, phone, productId, page, pageSize, sort }),
    });
  } catch (error) {
    console.error("Failed to load consultation list:", error);
    return res.status(500).json({
      success: false,
      message: "The consultation list could not be loaded.",
    });
  }
});

router.get("/:id/photos/:index", authenticateAdmin, async (req, res) => {
  const index = Number(req.params.index);
  if (!Number.isSafeInteger(index) || index < 0) {
    return res.status(400).json({ success: false, message: "Invalid photo." });
  }

  try {
    const storedPath = db.getConsultationPhotoPath(req.params.id, index);
    if (!storedPath) {
      return res.status(404).json({ success: false, message: "Consultation photo not found." });
    }

    const prefix = "/uploads/consultations/";
    const filename = storedPath.startsWith(prefix) ? storedPath.slice(prefix.length) : "";
    if (!filename || filename !== path.basename(filename)) {
      return res.status(404).json({ success: false, message: "Consultation photo not found." });
    }

    const filePath = path.resolve(uploadDirectory, filename);
    if (!filePath.startsWith(`${uploadDirectory}${path.sep}`)) {
      return res.status(404).json({ success: false, message: "Consultation photo not found." });
    }

    const contentType = path.extname(filename).toLowerCase() === ".png"
      ? "image/png"
      : path.extname(filename).toLowerCase() === ".jpg"
        ? "image/jpeg"
        : "";
    if (!contentType) {
      return res.status(404).json({ success: false, message: "Consultation photo not found." });
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
            ? "Consultation photo not found."
            : "Consultation photo could not be loaded.",
        });
      } else if (error) {
        console.error("Failed to send consultation photo:", error);
      }
    });
  } catch (error) {
    console.error("Failed to load consultation photo:", error);
    return res.status(500).json({
      success: false,
      message: "Consultation photo could not be loaded.",
    });
  }
});

router.get("/:id/messages", authenticateAdmin, (req, res) => {
  try {
    if (!db.getConsultationById(req.params.id)) {
      return res.status(404).json({ success: false, message: "Consultation request not found." });
    }
    return res.json({
      success: true,
      data: { messages: db.getConsultationMessages(req.params.id) },
    });
  } catch (error) {
    console.error("Failed to load consultation messages:", error);
    return res.status(500).json({ success: false, message: "Consultation messages could not be loaded." });
  }
});

router.post("/:id/messages", authenticateAdmin, (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 2000) {
    return res.status(400).json({
      success: false,
      message: "Message is required and must not exceed 2,000 characters.",
    });
  }
  try {
    if (!db.getConsultationById(req.params.id)) {
      return res.status(404).json({ success: false, message: "Consultation request not found." });
    }
    const data = db.createConsultationMessage({
      consultationId: req.params.id,
      actorType: "admin",
      actorId: req.admin.id,
      message,
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    console.error("Failed to send consultation message:", error);
    return res.status(500).json({ success: false, message: "Consultation message could not be sent." });
  }
});

router.get("/:id", authenticateAdmin, (req, res) => {
  try {
    const consultation = db.getConsultationById(req.params.id);
    if (!consultation) {
      return res.status(404).json({ success: false, message: "Consultation request not found." });
    }
    return res.json({ success: true, data: consultation });
  } catch (error) {
    console.error("Failed to load consultation details:", error);
    return res.status(500).json({
      success: false,
      message: "Consultation details could not be loaded.",
    });
  }
});

router.patch("/:id/status", authenticateAdmin, (req, res) => {
  const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
  if (!status || status.length > 40) {
    return res.status(400).json({
      success: false,
      message: "Invalid consultation status.",
    });
  }

  try {
    if (!db.getConsultationById(req.params.id)) {
      return res.status(404).json({ success: false, message: "Consultation request not found." });
    }
    const result = db.updateConsultationStatus(req.params.id, status);
    if (result?.invalidStatus) {
      return res.status(400).json({
        success: false,
        message: "Choose a status already used for a consultation request.",
        allowedStatuses: result.allowedStatuses,
      });
    }
    if (!result) {
      return res.status(404).json({ success: false, message: "Consultation request not found." });
    }
    return res.json({
      success: true,
      message: "Consultation status updated.",
      data: result,
    });
  } catch (error) {
    console.error("Failed to update consultation status:", error);
    return res.status(500).json({
      success: false,
      message: "Consultation status could not be updated.",
    });
  }
});

router.delete("/:id", authenticateAdmin, async (req, res) => {
  try {
    const consultation = db.getConsultationById(req.params.id);
    if (!consultation) {
      return res.status(404).json({ success: false, message: "Consultation request not found." });
    }
    if (String(consultation.status || "").trim().toLowerCase() !== "completed") {
      return res.status(409).json({
        success: false,
        message: "Only completed consultation requests can be deleted.",
      });
    }
    if (!db.deleteCompletedConsultation(req.params.id)) {
      return res.status(409).json({
        success: false,
        message: "The consultation request is no longer completed and could not be deleted.",
      });
    }

    const photoPrefix = "/uploads/consultations/";
    for (const photo of consultation.photos) {
      const filename = photo.startsWith(photoPrefix) ? photo.slice(photoPrefix.length) : "";
      if (!filename || filename !== path.basename(filename)) {
        console.error("Skipped deleting an invalid consultation photo path.");
        continue;
      }
      const filePath = path.resolve(uploadDirectory, filename);
      if (!filePath.startsWith(`${uploadDirectory}${path.sep}`)) {
        console.error("Skipped deleting a consultation photo outside the upload directory.");
        continue;
      }
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("Failed to delete a completed consultation photo:", error);
        }
      }
    }

    return res.json({
      success: true,
      message: "Completed consultation request deleted.",
    });
  } catch (error) {
    console.error("Failed to delete completed consultation:", error);
    return res.status(500).json({
      success: false,
      message: "The completed consultation request could not be deleted.",
    });
  }
});

router.post("/", authenticateCustomer, (req, res, next) => {
  upload.array("photos", 3)(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      const tooMany = error.code === "LIMIT_FILE_COUNT";
      const message = tooLarge
        ? "Each photo must not exceed 5 MB."
        : tooMany
          ? "You can submit up to 3 photos."
          : "Invalid attachment. Select up to 3 JPG or PNG photos.";
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        message,
        errors: { photos: message },
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Photos could not be processed.",
      errors: { photos: error.message || "Choose JPG or PNG photos." },
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
      errors.referenceMotorId = "Reference motorcycle not found. Choose another motorcycle from the catalog.";
    } else if (String(referenceMotor.stockStatus || "").toLowerCase() !== "tersedia") {
      errors.referenceMotorId = "The reference motorcycle is no longer active in the catalog. Choose another motorcycle.";
    }
  }

  for (const photo of photos) {
    if (!isValidImage(photo)) {
      errors.photos = `${photo.originalname || "Photo"} is not a valid JPG or PNG file.`;
      break;
    }
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({
      success: false,
      message: "Check the highlighted consultation details.",
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
      customerId: req.customer.id,
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
      message: "Consultation request saved.",
      data: stored,
    });
  } catch (error) {
    for (const file of savedFiles) {
      try {
        await fs.unlink(file.filePath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error("Failed to clean up unsaved consultation photos:", cleanupError);
        }
      }
    }
    console.error("Failed to save consultation request:", error);
    return res.status(500).json({
      success: false,
      message: "Your request was not saved. Your form data is still available; please try again.",
    });
  }
});

export default router;
