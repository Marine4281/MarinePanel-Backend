// models/User.js
import mongoose from "mongoose";

const normalizeCountryCode = (value) => {
  if (!value) return value;

  const map = {
    "united states": "US",
    "usa": "US",
    "us": "US",
    "kenya": "KE",
  };

  const cleaned = value.toString().trim().toLowerCase();
  return map[cleaned] || cleaned.toUpperCase();
};

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
    },

    // Display only
    country: {
      type: String,
      required: true,
      trim: true,
    },

    // SOURCE OF TRUTH (for flags, logic)
    countryCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      set: normalizeCountryCode,
    },

    password: {
      type: String,
      required: true,
    },

    isAdmin: {
      type: Boolean,
      default: false,
    },

    /*
    ----------------------------------------------------------------
    SCOPE
    Every user belongs to exactly one scope.
    'platform'  = registered on marinepanel.online directly
    <ObjectId>  = registered on a child panel (stores the child
                  panel owner's _id as a string)

    Same email on Child Panel A and Child Panel B = two completely
    separate accounts. No cross-panel lookup ever happens.
    ----------------------------------------------------------------
    */
    scope: {
      type: String,
      default: "platform",
      trim: true,
    },

    /*
    --------------------------------
    ACCOUNT CONTROL
    --------------------------------
    */
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    isFrozen: {
      type: Boolean,
      default: false,
      index: true,
    },

    /*
    --------------------------------
    USER WALLET
    --------------------------------
    */
    balance: {
      type: Number,
      default: 0,
    },

    // Last Seen
    lastSeen: {
      type: Date,
      default: null,
    },

    /*
    --------------------------------
    RESELLER SYSTEM
    --------------------------------
    */
    isReseller: {
      type: Boolean,
      default: false,
      index: true,
    },

    brandName: {
      type: String,
      default: null,
      trim: true,
    },

    brandSlug: {
      type: String,
      default: null,
      trim: true,
    },

    logo: {
      type: String,
      default: null,
      trim: true,
    },

    themeColor: {
      type: String,
      default: "#ff6b00",
      trim: true,
    },

    domainType: {
      type: String,
      enum: ["custom", "subdomain"],
      default: "subdomain",
    },

    resellerDomain: {
      type: String,
      default: null,
      trim: true,
    },

    resellerCustomDomain: {
      type: String,
      default: null,
      trim: true,
    },

    resellerCommissionRate: {
      type: Number,
      default: 0,
    },

    resellerWallet: {
      type: Number,
      default: 0,
    },

    resellerTotalEarned: {
      type: Number,
      default: 0,
    },

    resellerUsersCount: {
      type: Number,
      default: 0,
    },

    resellerOrdersCount: {
      type: Number,
      default: 0,
    },

    resellerActivatedAt: {
      type: Date,
      default: null,
    },

    /*
    --------------------------------
    RESELLER USER RELATION
    --------------------------------
    */
    resellerOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    /*
    --------------------------------
    Support Links
    --------------------------------
    */
    supportWhatsapp: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          const cleaned = v.replace(/\D/g, "");
          return cleaned.length >= 7 && cleaned.length <= 15;
        },
        message: "Invalid WhatsApp number",
      },
    },

    supportTelegram: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return typeof v === "string";
        },
      },
    },

    supportWhatsappChannel: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return v.startsWith("http");
        },
        message: "Channel must be a valid link",
      },
    },

    /*
    --------------------------------
    API ACCESS
    --------------------------------
    */
    apiAccessEnabled: {
      type: Boolean,
      default: false,
    },

    apiKey: {
      type: String,
      unique: true,
      sparse: true,
    },

    /*
    ================================================================
    CHILD PANEL SYSTEM
    ================================================================
    */

    // Is this user a child panel owner?
    isChildPanel: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Is this child panel currently active? Admin can suspend.
    childPanelIsActive: {
      type: Boolean,
      default: true,
    },

    // When this child panel was activated
    childPanelActivatedAt: {
      type: Date,
      default: null,
    },

    // Custom domain in production e.g. mypanel.com
    // During testing we use childPanelSlug for subdomains instead
    childPanelDomain: {
      type: String,
      default: null,
      trim: true,
    },

    // Subdomain slug for testing only
    // e.g. "cp1" resolves to cp1.marinepanel.online
    childPanelSlug: {
      type: String,
      default: null,
      trim: true,
    },

    // Branding
    childPanelBrandName: {
      type: String,
      default: null,
      trim: true,
    },

    childPanelLogo: {
      type: String,
      default: null,
      trim: true,
    },

    childPanelThemeColor: {
      type: String,
      default: "#1e40af",
      trim: true,
    },

    // Support links
    childPanelSupportWhatsapp: {
      type: String,
      default: "",
      trim: true,
    },

    childPanelSupportTelegram: {
      type: String,
      default: "",
      trim: true,
    },

    childPanelSupportWhatsappChannel: {
      type: String,
      default: "",
      trim: true,
    },

    /*
    Which child panel does this RESELLER belong to?
    null  = reseller belongs to main platform
    ObjId = reseller belongs to this child panel owner
    */
    childPanelOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    /*
    Billing mode assigned by main admin to this child panel.
    monthly   = flat fee charged every month
    per_order = fee per order processed on their panel
    both      = monthly flat + per order combined
    */
    childPanelBillingMode: {
      type: String,
      enum: ["monthly", "per_order", "both"],
      default: "monthly",
    },

    // Monthly fee charged by main admin to this child panel
    childPanelMonthlyFee: {
      type: Number,
      default: 0,
    },

    // Per-order fee charged by main admin to this child panel
    childPanelPerOrderFee: {
      type: Number,
      default: 0,
    },

    // Orders this billing cycle — reset to 0 by cron job monthly
    childPanelOrdersThisCycle: {
      type: Number,
      default: 0,
    },

    // Last time main admin successfully billed this child panel
    childPanelLastBilledAt: {
      type: Date,
      default: null,
    },

    // Activation fee this child panel charges their own resellers
    childPanelResellerActivationFee: {
      type: Number,
      default: 25,
    },

    // Minimum withdrawal from childPanelWallet
    childPanelWithdrawMin: {
      type: Number,
      default: 10,
    },

    /*
    Payment gateway mode:
    'platform' = uses marinepanel Paystack — deposits go to admin
                 then auto-credited to child panel wallet,
                 which then credits their user wallet
    'own'      = child panel uses their own gateway API keys
    'none'     = not connected yet
    */
    childPanelPaymentMode: {
      type: String,
      enum: ["platform", "own", "none"],
      default: "none",
    },

    /*
    Service source mode:
    'platform' = marinepanel services used as their provider
    'own'      = their own provider API keys
    'both'     = mix of platform services + own providers
    'none'     = not connected yet
    */
    childPanelServiceMode: {
      type: String,
      enum: ["platform", "own", "both", "none"],
      default: "none",
    },

    // UI template selected by this child panel owner
    childPanelTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChildPanelTemplate",
      default: null,
    },

    // Kept for backward compatibility — use isChildPanel instead
    childPanelEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/*
----------------------------------------------------------------
INDEXES
----------------------------------------------------------------
*/

// Reseller (original — untouched)
userSchema.index({ resellerOwner: 1 });
userSchema.index({ brandSlug: 1 });
userSchema.index({ resellerDomain: 1 });

// Child panel (new)
userSchema.index({ childPanelOwner: 1 });
userSchema.index({ childPanelDomain: 1 }, { sparse: true });
userSchema.index({ childPanelSlug: 1 }, { sparse: true });
userSchema.index({ isChildPanel: 1, childPanelIsActive: 1 });

/*
CRITICAL — scope-based unique constraints replace the old
unique:true on email and phone fields.
Same email is allowed across different scopes (different panels)
but never within the same scope.
*/
userSchema.index({ email: 1, scope: 1 }, { unique: true });
userSchema.index({ phone: 1, scope: 1 }, { unique: true });
userSchema.index({ scope: 1 });

const User = mongoose.model("User", userSchema);

export default User;
