// app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

// Routes
import seoRoutes from "./routes/seoRoutes.js";
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
import supportRoutes from "./routes/supportRoutes.js";
import maintenanceRoutes from "./routes/maintenanceRoutes.js";

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
import financialRoutes from "./routes/financialRoutes.js";
import paymentGatewayRoutes from "./routes/paymentGatewayRoutes.js";
import adminWithdrawalRoutes from "./routes/adminWithdrawalRoutes.js";
import childPanelGuideRoutes, { adminGuideRouter as cpGuideAdminRoutes }
  from "./routes/childPanelGuideRoutes.js";
import adminSyncRoutes from "./routes/adminSyncRoutes.js";

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
import cpOwnerServiceRoutes from "./routes/cpOwnerServiceRoutes.js";
import cpOwnerFinancialRoutes from "./routes/cpOwnerFinancialRoutes.js";
import cpOwnerResellerGuidesRoutes from "./routes/cpOwnerResellerGuidesRoutes.js";
import cpOwnerCategoryRoutes from "./routes/cpOwnerCategoryRoutes.js";
import cpAdminLogRoutes from "./routes/cpAdminLogRoutes.js";

// Middleware
import { protect as authMiddleware } from "./middlewares/authMiddleware.js";
import updateLastSeen from "./middlewares/updateLastSeen.js";
import { adminOnly } from "./middlewares/adminMiddleware.js";

dotenv.config();

const withLastSeen = [authMiddleware, updateLastSeen];
const adminStack = [authMiddleware, updateLastSeen, adminOnly];

/* =================================================
   DOMAIN HELPERS
================================================= */
const normalizeDomain = (raw) =>
  raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase()
    .trim();

/* =================================================
   CHILD PANEL DOMAIN CACHE
================================================= */
const allowedChildDomains = new Set();

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

loadChildDomains().catch((err) =>
  console.error("Domain load failed:", err.message)
);

export const refreshChildDomains = async () => {
  await loadChildDomains();
};

/* =================================================
   RESELLER DOMAIN CACHE
================================================= */
const allowedResellerDomains = new Set();

const loadResellerDomains = async () => {
  try {
    const { default: User } = await import("./models/User.js");

    const resellers = await User.find({
      isReseller: true,
      resellerDomain: { $ne: null },
    }).select("resellerDomain");

    allowedResellerDomains.clear();

    resellers.forEach((r) => {
      if (r.resellerDomain) {
        allowedResellerDomains.add(normalizeDomain(r.resellerDomain));
      }
    });

    console.log(`✅ Reseller domains loaded: ${allowedResellerDomains.size}`);
  } catch (err) {
    console.error("❌ Failed to load reseller domains:", err.message);
  }
};

loadResellerDomains().catch((err) =>
  console.error("Reseller domain load failed:", err.message)
);

export const refreshResellerDomains = async () => {
  await loadResellerDomains();
};

/* =================================================
   COMBINED ALLOWED ORIGINS CHECK
   Used by both Express CORS and Socket.IO
================================================= */
export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const clean = normalizeDomain(origin);
  return (
    clean === "marinepanel.online" ||
    clean === "marinecash.online" ||
    clean.endsWith(".marinepanel.online") ||
    clean.endsWith(".marinecash.online") ||
    /\.vercel\.app$/.test(clean) ||
    allowedChildDomains.has(clean) ||
    allowedResellerDomains.has(clean)
  );
};

/* =================================================
   APP
================================================= */
const app = express();

app.set("trust proxy", 1);

/* Security */
app.use(helmet());

/* =================================================
   CORS
================================================= */
const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    console.log("🚫 Blocked by CORS:", origin);
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
app.options(/.*/, cors(corsOptions));

/* =================================================
   DOMAIN & SCOPE DETECTION
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
app.use("/api/v2", apiV2Routes);
app.use("/api/support", supportRoutes);
app.use("/api/maintenance", maintenanceRoutes);

/* =================================================
   RESELLER ROUTES
================================================= */
app.use("/api/reseller", resellerRoutes);
app.use("/api/branding", brandingRoutes);
app.use("/api/seo", seoRoutes);
app.use("/api/reseller-guides", resellerGuideRoutes);
app.use("/api/reseller/services", resellerServiceRoutes);
app.use("/api/end-user", endUserRoutes);

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
app.use("/api/cp/services", authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerServiceRoutes);
app.use("/api/child-panel/guides", childPanelGuideRoutes);
app.use("/api/cp/financial", authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerFinancialRoutes);
app.use("/api/cp/reseller-guides", authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerResellerGuidesRoutes);
app.use("/api/cp/categories", authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerCategoryRoutes);
app.use("/api/cp/logs", authMiddleware, cpOwnerOnly, updateLastSeen, cpAdminLogRoutes);

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
app.use("/api/admin/financial", authMiddleware, adminOnly, financialRoutes);
app.use("/api/admin/withdrawals", authMiddleware, adminOnly, adminWithdrawalRoutes);
app.use("/api", paymentGatewayRoutes);
app.use("/api/child-panel", childPanelGuideRoutes);
app.use("/api/admin/child-panel-guides", cpGuideAdminRoutes);
app.use("/api/admin/sync", adminSyncRoutes);

export default app;
