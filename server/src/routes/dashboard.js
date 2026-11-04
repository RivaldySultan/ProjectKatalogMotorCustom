import express from "express";
import { db } from "../db/db.js";
import { authenticateAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/summary", authenticateAdmin, (req, res) => {
  try {
    const summary = db.getDashboardSummary();
    return res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Gagal memuat ringkasan dashboard:", error);
    return res.status(500).json({
      success: false,
      message: "Ringkasan dashboard belum dapat dimuat.",
    });
  }
});

export default router;
