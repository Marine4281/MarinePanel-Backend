// app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

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
import paymentRoutes from "./routes/paymentRoutes.js";
import commissionRoutes from "./routes/commissionRoutes.js";

//Reseller Routes
import resellerRoutes from "./routes/resellerRoutes.js";
import { detectResellerDomain } from "./middlewares/resellerDomainMiddleware.js";
import brandingRoutes from "./routes/brandingRoutes.js";
import resellerGuideRoutes from "./routes/resellerGuideRoutes.js";
import resellerServiceRoutes from "./routes/resellerServiceRoutes.js";
import endUserRoutes from "./routes/endUserRoutes.js";
import resellerAdminRoutes from "./routes/resellerAdminRoutes.js";



// ← NEW: Admin Orders Route
import adminOrderRoutes from "./routes/adminOrderRoutes.js";
import adminUserOrdersRoutes from "./routes/adminUserOrdersRoutes.js";
import providerRoutes from "./routes/providerRoutes.js";
import adminLogRoutes from "./routes/adminLogRoutes.js";

// ✅ Last Seen Middleware (SAFE VERSION)
import { protect as authMiddleware } from "./middlewares/authMiddleware.js";
import updateLastSeen from "./middlewares/updateLastSeen.js";

const withLastSeen = [authMiddleware, updateLastSeen];

dotenv.config();
const app = express();

app.set("trust proxy", 1);

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
    origin: (origin, callback) => {

      if (!origin) return callback(null, true);

      if (
        origin.endsWith(".marinepanel.online") ||
        origin === "https://marinepanel.online" ||
        origin === "http://marinepanel.online" ||
        /\.vercel\.app$/.test(origin)
      ) {
        return callback(null, true);
      }

      console.log("Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

/* Body parser */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(morgan("dev"));
/* Health check */
app.get("/", (req, res) => {
res.json({ status: "Marine backend running" });
});

/* CORS preflight */
app.options(/./, cors());

/* Cookies routes */
app.use(cookieParser());

/* Detect reseller subdomain */
app.use(detectResellerDomain);


/* Public routes */
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes); // ✅ public service routes
app.use("/api/orders", orderRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/smm", smmWebhookRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/settings", commissionRoutes);
app.use("/api/admin/resellers", resellerAdminRoutes);

//Reseller Routes
app.use("/api/reseller", resellerRoutes);
app.use("/api/branding", brandingRoutes);
app.use("/api/reseller-guides", resellerGuideRoutes);
app.use("/api/reseller/services", resellerServiceRoutes);
app.use("/api/end-users", endUserRoutes);

/* Protected routes */
app.use("/api/users", withLastSeen, userRoutes);
app.use("/api/orders", withLastSeen, orderRoutes);
app.use("/api/wallet", withLastSeen, walletRoutes);


/* Admin routes */
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/services", adminServiceRoutes); // ✅ admin-only service routes
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/admin/payment-methods", adminPaymentMethodRoutes);
app.use("/api/provider", providerRoutes);

// ← NEW: Admin Orders
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/user-orders", adminUserOrdersRoutes);
app.use("/api/admin-logs", adminLogRoutes);

export default app;
