// app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

// Routes
import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";           // ✅ Public service routes
import adminServiceRoutes from "./routes/adminServiceRoutes.js"; // ✅ Admin-only services
import orderRoutes from "./routes/orderRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import adminUserRoutes from "./routes/adminUserRoutes.js";
import adminSettingsRoutes from "./routes/adminSettingsRoutes.js";
import paymentMethodRoutes from "./routes/paymentMethodRoutes.js";
import adminPaymentMethodRoutes from "./routes/adminPaymentMethodRoutes.js";
import smmWebhookRoutes from "./routes/smmWebhookRoutes.js";

// ← NEW: Admin Orders Route
import adminOrderRoutes from "./routes/adminOrderRoutes.js";

dotenv.config();
const app = express();

/* Security */
app.use(helmet());

/* Rate limit */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                 // limit each IP
  })
);

/* Middlewares */
app.use(
  cors({
    origin: "https://marine-panel-frontend.vercel.app/", // frontend origin
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));

/* Health check */
app.get("/", (req, res) => {
  res.json({ status: "Marine backend running" });
});

/* CORS preflight */
app.options(/.*/, cors());

/* Public routes */
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes); // ✅ public service routes
app.use("/api/orders", orderRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/smm", smmWebhookRoutes);

/* Admin routes */
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users", adminUserRoutes); 
app.use("/api/admin/services", adminServiceRoutes); // ✅ admin-only service routes
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/admin/payment-methods", adminPaymentMethodRoutes);

// ← NEW: Admin Orders
app.use("/api/admin/orders", adminOrderRoutes);

export default app;