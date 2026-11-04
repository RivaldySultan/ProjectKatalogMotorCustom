import express from "express";
import { db } from "../db/db.js";
import { authenticateAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get(`/`, (req, res) => {
  const categories = db.getCategories();
  res.json({
    success: true,
    data: categories,
  });
});

router.post(`/`, authenticateAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Category name is required",
    });
  }

  const existing = db
    .getCategories()
    .find((cat) => cat.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Category already exists",
    });
  }

  try {
    const newCat = db.addCategory(name.trim());
    res.status(201).json({
      success: true,
      data: newCat,
      message: "Category added successfully",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

router.put(`/:id`, authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Category name is required",
    });
  }

  try {
    const updated = db.updateCategory(id, name.trim());
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }
    res.json({
      success: true,
      data: updated,
      message: "Category updated successfully",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

router.delete(`/:id`, authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const products = db.getProducts({ categoryId: id });

  if (products.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Cannot delete category with existing products",
    });
  }

  try {
    const deleted = db.deleteCategory(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }
    res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

export default router;
