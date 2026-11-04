import express from "express";
import { db } from "../db/db.js";
import { authenticateAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get(`/`, (req, res) => {
  const settings = db.getSettings();
  res.json({
    success: true,
    data: settings,
  });
});

router.put(`/`, authenticateAdmin, (req, res) => {
  const {
    storeName,
    tagline,
    slug,
    address,
    phone,
    currency,
    activeWhatsApp,
  } = req.body;

  const updates = {};
  if (storeName !== undefined && storeName !== null) updates.storeName = storeName;
  if (tagline !== undefined && tagline !== null) updates.tagline = tagline;
  if (slug !== undefined && slug !== null) updates.slug = slug;
  if (phone !== undefined && phone !== null) {
    updates.phone = String(phone).replace(/[^0-9]/g, "");
  }
  if (currency !== undefined && currency !== null) updates.currency = currency;
  if (activeWhatsApp !== undefined && activeWhatsApp !== null) {
    updates.activeWhatsApp = activeWhatsApp;
  }
  if (address !== undefined && address !== null) updates.address = address;

  const updated = db.updateSettings(updates);

  res.json({
    success: true,
    data: updated,
    message: "Store settings updated successfully",
  });
});

export default router;
