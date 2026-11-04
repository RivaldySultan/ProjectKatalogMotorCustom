import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import customerRoutes from "./routes/customers.js";
import categoryRoutes from "./routes/categories.js";
import consultationRoutes from "./routes/consultations.js";
import dashboardRoutes from "./routes/dashboard.js";
import productRoutes from "./routes/products.js";
import purchaseRoutes from "./routes/purchases.js";
import storeRoutes from "./routes/store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Order-Access-Token"],
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadPath = path.join(__dirname, `../uploads`);
app.use("/uploads/consultations", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Foto konsultasi hanya tersedia melalui akses admin.",
  });
});
app.use("/uploads/payment-proofs", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Bukti pembayaran hanya tersedia melalui akses admin.",
  });
});
app.use("/uploads", express.static(uploadPath));

app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/store", storeRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "KatalogMotorCustom API",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to KatalogMotorCustom API",
    endpoints: {
      auth: "/api/auth",
      customers: "/api/customers",
      categories: "/api/categories",
      consultations: "/api/consultations",
      dashboard: "/api/dashboard/summary",
      products: "/api/products",
      purchases: "/api/purchases",
      store: "/api/store",
      health: "/api/health",
    },
  });
});

app.listen(port, () => {
  console.log(
    `Server KatalogMotorCustom is running on http://localhost:${port}`,
  );
});
