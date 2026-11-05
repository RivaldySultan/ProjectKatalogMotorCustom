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
    console.error("Failed to load dashboard summary:", error);
    return res.status(500).json({
      success: false,
      message: "The dashboard summary could not be loaded.",
    });
  }
});

export default router;
