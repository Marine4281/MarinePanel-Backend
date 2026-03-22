import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    // Admin commission percentage
    commission: {
      type: Number,
      default: 50, // 50%
    },

    // Platform total revenue
    totalRevenue: {
      type: Number,
      default: 0,
    },

    // Reseller activation fee
    resellerActivationFee: {
      type: Number,
      default: 25,
    },

    // Minimum reseller withdraw amount
    resellerWithdrawMin: {
      type: Number,
      default: 10,
    },

    /*
    --------------------------------
    Support Links
    --------------------------------
    */
    supportWhatsapp: {
      type: String,
      default: "",
    },
    
   supportTelegram: {
     type: String,
     default: "",
   },
    
   supportWhatsappChannel: {
     type: String,
     default: "",
   },


    // Platform domain used for reseller subdomains
    platformDomain: {
      type: String,
      default: "marinepanel.online",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Settings ||
  mongoose.model("Settings", settingsSchema);
