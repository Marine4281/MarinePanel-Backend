import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

// Routes
import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";           
import adminServiceRoutes from "./routes/adminServiceRoutes.js"; 
import orderRoutes from "./routes/orderRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import adminUserRoutes from "./routes/adminUserRoutes.js";
import adminSettingsRoutes from "./routes/adminSettingsRoutes.js";
import paymentMethodRoutes from "./routes/paymentMethodRoutes.js";
import adminPaymentMethodRoutes from "./routes/adminPaymentMethodRoutes.js";
import smmWebhookRoutes from "./routes/smmWebhookRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import adminOrderRoutes from "./routes/adminOrderRoutes.js";
import adminUserOrdersRoutes from "./routes/adminUserOrdersRoutes.js";

dotenv.config();
const app = express();
app.set("trust proxy", 1);

/* Security */
app.use(helmet());

/* Rate limit */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  })
);

/* CORS */
const allowedOrigins = [
  "https://marinepanel.online",
  "http://marinepanel.online",
  "https://www.marinepanel.online",
  "http://www.marinepanel.online",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // server-side or Postman requests
      if (allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) {
        callback(null, true);
      } else {
        console.log("Blocked by Express CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

/* Handle preflight requests for all routes */
app.options("*", cors({
  origin: allowedOrigins,
  credentials: true,
}));

/* Body parser */
app.use(express.json());
app.use(morgan("dev"));

/* Health check */
app.get("/", (req, res) => {
  res.json({ status: "Marine backend running" });
});

/* Public routes */
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/smm", smmWebhookRoutes);
app.use("/api/payment", paymentRoutes);

/* Admin routes */
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/services", adminServiceRoutes);
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/admin/payment-methods", adminPaymentMethodRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/user-orders", adminUserOrdersRoutes);

export default app;
