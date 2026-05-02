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

// Child Panel Routes (new)
import childPanelRoutes from "./routes/childPanelRoutes.js";
import childPanelAdminRoutes from "./routes/childPanelAdminRoutes.js";
import { detectChildPanelDomain , childPanelOnly} from "./middlewares/childPanelMiddleware.js";
import { attachScope } from "./middlewares/scopeMiddleware.js";
import cpOwnerUserRoutes from "./routes/cpOwnerUserRoutes.js";
import cpOwnerOrderRoutes from "./routes/cpOwnerOrderRoutes.js";
import cpOwnerResellerRoutes from "./routes/cpOwnerResellerRoutes.js";
import cpOwnerProviderRoutes from "./routes/cpOwnerProviderRoutes.js";

// Middleware
import { protect as authMiddleware } from "./middlewares/authMiddleware.js";
import updateLastSeen from "./middlewares/updateLastSeen.js";
import { adminOnly } from "./middlewares/adminMiddleware.js";

const withLastSeen = [authMiddleware, updateLastSeen];
const adminStack = [authMiddleware, updateLastSeen, adminOnly];

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

/* Cookies */
app.use(cookieParser());

/*
----------------------------------------------------------------
DOMAIN & SCOPE DETECTION
Order matters:
1. detectResellerDomain  — checks if request is from a reseller domain
2. detectChildPanelDomain — checks if request is from a child panel domain
3. attachScope           — sets req.scope based on the above results
                           used in all auth lookups for user isolation
----------------------------------------------------------------
*/
app.use(detectResellerDomain);
app.use(detectChildPanelDomain);
app.use(attachScope);

/* Public routes */
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

// Reseller routes
app.use("/api/reseller", resellerRoutes);
app.use("/api/branding", brandingRoutes);
app.use("/api/reseller-guides", resellerGuideRoutes);
app.use("/api/reseller/services", resellerServiceRoutes);
app.use("/api/end-users", endUserRoutes);

// Child panel routes (new)
app.use("/api/child-panel", childPanelRoutes);
app.use("/api/admin/child-panels", childPanelAdminRoutes);
app.use("/api/cp/users", authMiddleware, childPanelOnly, updateLastSeen, cpOwnerUserRoutes);
app.use("/api/cp/orders", authMiddleware, childPanelOnly, updateLastSeen, cpOwnerOrderRoutes);
app.use("/api/cp/resellers", authMiddleware, childPanelOnly, updateLastSeen, cpOwnerResellerRoutes);

/* Admin routes */
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

export default app;
