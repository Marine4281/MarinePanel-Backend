// app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

// 🔥 NEW (must be at top)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Reseller from "./models/Reseller.js";

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

// Reseller Routes
import resellerRoutes from "./routes/resellerRoutes.js";
import { detectResellerDomain } from "./middlewares/resellerDomainMiddleware.js";
import brandingRoutes from "./routes/brandingRoutes.js";
import resellerGuideRoutes from "./routes/resellerGuideRoutes.js";
import resellerServiceRoutes from "./routes/resellerServiceRoutes.js";
import endUserRoutes from "./routes/endUserRoutes.js";

// Admin
import adminOrderRoutes from "./routes/adminOrderRoutes.js";
import adminUserOrdersRoutes from "./routes/adminUserOrdersRoutes.js";
import providerRoutes from "./routes/providerRoutes.js";

dotenv.config();
const app = express();

app.set("trust proxy", 1);

/* ========================================
   FIX __dirname (ES MODULES)
======================================== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ========================================
   SECURITY
======================================== */
app.use(helmet());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  })
);

/* ========================================
   CORS
======================================== */
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

/* ========================================
   BODY PARSER
======================================== */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(morgan("dev"));

/* ========================================
   HEALTH CHECK
======================================== */
app.get("/", (req, res) => {
  res.json({ status: "Marine backend running" });
});

app.options(/.*/, cors());

/* ========================================
   COOKIES
======================================== */
app.use(cookieParser());

/* ========================================
   DETECT RESELLER
======================================== */
app.use(detectResellerDomain);

/* ========================================
   API ROUTES
======================================== */
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/smm", smmWebhookRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/settings", commissionRoutes);

// Reseller
app.use("/api/reseller", resellerRoutes);
app.use("/api/branding", brandingRoutes);
app.use("/api/reseller-guides", resellerGuideRoutes);
app.use("/api/reseller/services", resellerServiceRoutes);
app.use("/api/end-users", endUserRoutes);

// Admin
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/services", adminServiceRoutes);
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/admin/payment-methods", adminPaymentMethodRoutes);
app.use("/api/provider", providerRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/user-orders", adminUserOrdersRoutes);

/* ========================================
   SERVE FRONTEND STATIC FILES
======================================== */
app.use(express.static(path.join(__dirname, "dist")));

/* ========================================
   SERVE FRONTEND + INJECT BRANDING
======================================== */
app.get("*", async (req, res) => {
  try {
    const host = req.headers.host;

    let branding = {
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",
    };

    // 🔥 Detect reseller properly
    const parts = host.split(".");
    let slug = null;

    if (host.includes("marinepanel.online")) {
      if (parts.length > 2) {
        slug = parts[0];
      }
    } else {
      // custom domain
      slug = host;
    }

    if (slug && slug !== "www" && slug !== "marinepanel") {
      const reseller = await Reseller.findOne({
        $or: [{ slug }, { domain: host }],
      });

      if (reseller) {
        branding = {
          brandName: reseller.brandName,
          logo: reseller.logo,
          themeColor: reseller.themeColor,
          domain: reseller.domain,
        };
      }
    }

    const filePath = path.join(__dirname, "dist", "index.html");
    let html = fs.readFileSync(filePath, "utf-8");

    html = html.replace(
      "</head>",
      `
      <script>
        window.__BRANDING__ = ${JSON.stringify(branding)};
        document.documentElement.style.setProperty("--theme-color", "${branding.themeColor}");
        document.title = "${branding.brandName}";
      </script>
      </head>
      `
    );

    res.send(html);
  } catch (err) {
    console.error("Branding injection error:", err);
    res.status(500).send("Server error");
  }
});

export default app;
