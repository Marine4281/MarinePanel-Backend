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
import commissionRoutes from "./routes/commissionRoutes.js";
import apiV2Routes from "./routes/apiV2Routes.js";

// Reseller Routes
import resellerRoutes from "./routes/resellerRoutes.js";
import { detectResellerDomain } from "./middlewares/resellerDomainMiddleware.js";
import brandingRoutes from "./routes/brandingRoutes.js";
import resellerGuideRoutes from "./routes/resellerGuideRoutes.js";
import resellerServiceRoutes from "./routes/resellerServiceRoutes.js";
import endUserRoutes from "./routes/endUserRoutes.js";
import resellerAdminRoutes from "./routes/resellerAdminRoutes.js";

// Admin Orders
import adminOrderRoutes from "./routes/adminOrderRoutes.js";
import adminUserOrdersRoutes from "./routes/adminUserOrdersRoutes.js";
import providerRoutes from "./routes/providerRoutes.js";
import adminLogRoutes from "./routes/adminLogRoutes.js";
import providerProfileRoutes from "./routes/providerProfileRoutes.js";
import categoryMetaRoutes from "./routes/categoryMetaRoutes.js";

// Child Panel Routes
import childPanelRoutes from "./routes/childPanelRoutes.js";
import childPanelAdminRoutes from "./routes/childPanelAdminRoutes.js";
import { detectChildPanelDomain, childPanelOnly, cpOwnerOnly } from "./middlewares/childPanelMiddleware.js";
import { attachScope } from "./middlewares/scopeMiddleware.js";
import cpOwnerUserRoutes from "./routes/cpOwnerUserRoutes.js";
import cpOwnerOrderRoutes from "./routes/cpOwnerOrderRoutes.js";
import cpOwnerResellerRoutes from "./routes/cpOwnerResellerRoutes.js";
import cpOwnerProviderRoutes from "./routes/cpOwnerProviderRoutes.js";
import cpOwnerSettingsRoutes from "./routes/cpOwnerSettingsRoutes.js";
import cpOwnerWithdrawalRoutes from "./routes/cpOwnerWithdrawalRoutes.js";
import adminWithdrawalRoutes from "./routes/adminWithdrawalRoutes.js";
import cpOwnerServiceRoutes from "./routes/cpOwnerServiceRoutes.js";


// Middleware
import { protect as authMiddleware } from "./middlewares/authMiddleware.js";
import updateLastSeen from "./middlewares/updateLastSeen.js";
import { adminOnly } from "./middlewares/adminMiddleware.js";

dotenv.config();

const withLastSeen = [authMiddleware, updateLastSeen];
const adminStack = [authMiddleware, updateLastSeen, adminOnly];

/* =================================================
   CHILD PANEL DOMAIN CACHE
   Loaded once on startup, refreshed when a child
   panel is activated or their domain is updated.
   Avoids a DB hit on every single CORS preflight.
================================================= */
const allowedChildDomains = new Set();

const normalizeDomain = (raw) =>
  raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase()
    .trim();

const loadChildDomains = async () => {
  try {
    const { default: User } = await import("./models/User.js");

    const panels = await User.find({
      isChildPanel: true,
      childPanelIsActive: true,
      childPanelDomain: { $ne: null },
    }).select("childPanelDomain");

    allowedChildDomains.clear();

    panels.forEach((p) => {
      if (p.childPanelDomain) {
        allowedChildDomains.add(normalizeDomain(p.childPanelDomain));
      }
    });

    console.log(`✅ Child panel domains loaded: ${allowedChildDomains.size}`);
  } catch (err) {
    console.error("❌ Failed to load child panel domains:", err.message);
  }
};

// Call after DB connects — safe even if it fails,
// domains will just be rechecked on next server start
loadChildDomains().catch((err) =>
  console.error("Domain load failed:", err.message)
);

// Export so childPanelAdminController can refresh the cache
// when a panel is activated or its domain is updated
export const refreshChildDomains = async () => {
  await loadChildDomains();
};

/* =================================================
   APP
================================================= */
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

/* =================================================
   CORS
   Sync callback — no await needed because we use
   the in-memory Set, not a DB query per request.
================================================= */
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const clean = normalizeDomain(origin);

    if (
      clean === "marinepanel.online" ||
      clean.endsWith(".marinepanel.online") ||
      /\.vercel\.app$/.test(clean) ||
      allowedChildDomains.has(clean)
    ) {
      return callback(null, true);
    }

    console.log("🚫 Blocked by CORS:", clean);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(cors(corsOptions));

/* Body parser */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(morgan("dev"));

/* Cookies */
app.use(cookieParser());

/* Health check */
app.get("/", (req, res) => {
  res.json({ status: "Marine backend running" });
});

/* CORS preflight — must use same corsOptions */
app.options(/./, cors(corsOptions));

/* =================================================
   DOMAIN & SCOPE DETECTION
   Order matters:
   1. detectResellerDomain   — is this a reseller domain?
   2. detectChildPanelDomain — is this a child panel domain?
   3. attachScope            — sets req.scope for user isolation
================================================= */
app.use(detectResellerDomain);
app.use(detectChildPanelDomain);
app.use(attachScope);

/* =================================================
   PUBLIC ROUTES
================================================= */
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/orders", withLastSeen, orderRoutes);
app.use("/api/wallet", withLastSeen, walletRoutes);
app.use("/api/users", withLastSeen, userRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/smm", smmWebhookRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/settings", commissionRoutes);
app.use("/api/admin/resellers", resellerAdminRoutes);
app.use("/api", apiV2Routes);

/* =================================================
   RESELLER ROUTES
================================================= */
app.use("/api/reseller", resellerRoutes);
app.use("/api/branding", brandingRoutes);
app.use("/api/reseller-guides", resellerGuideRoutes);
app.use("/api/reseller/services", resellerServiceRoutes);
app.use("/api/end-users", endUserRoutes);

/* =================================================
   CHILD PANEL ROUTES
================================================= */
app.use("/api/child-panel", childPanelRoutes);
app.use("/api/admin/child-panels", childPanelAdminRoutes);
app.use("/api/cp/users", authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerUserRoutes);
app.use("/api/cp/orders", authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerOrderRoutes);
app.use("/api/cp/resellers", authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerResellerRoutes);
app.use("/api/cp/providers", authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerProviderRoutes);
app.use("/api/cp/settings", authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerSettingsRoutes);
app.use("/api/cp/services",authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerServiceRoutes);
// Child panel withdrawal
app.use("/api/cp/child-panel", authMiddleware, childPanelOnly, updateLastSeen, cpOwnerWithdrawalRoutes);

// Admin withdrawal management
app.use("/api/admin/withdrawals", authMiddleware, adminOnly, adminWithdrawalRoutes);

/* =================================================
   ADMIN ROUTES
================================================= */
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users", adminStack, adminUserRoutes);
app.use("/api/admin/services", adminServiceRoutes);
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/admin/payment-methods", adminPaymentMethodRoutes);
app.use("/api/provider", providerRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/user-orders", adminUserOrdersRoutes);
app.use("/api/admin-logs", adminLogRoutes);
app.use("/provider", providerProfileRoutes);
app.use("/api/category-meta", categoryMetaRoutes);

export default app;
