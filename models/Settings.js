// models/Settings.js
const mongoose = require("mongoose");

const badgeTierSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  minReferrals: { type: Number, required: true },
  badgeImage:   { type: String },
  color:        { type: String },
}, { _id: true });

const announcementSchema = new mongoose.Schema({
  text:      { type: String, required: true },
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const pollOptionSchema = new mongoose.Schema({
  text:  { type: String, required: true },
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { _id: true });

const pollSchema = new mongoose.Schema({
  question:  { type: String, required: true },
  options:   [pollOptionSchema],
  isActive:  { type: Boolean, default: true },
  expiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const settingsSchema = new mongoose.Schema({
  // FEES — set by admin, no defaults
  platformFeePct:   { type: Number },
  offerwallFeePct:  { type: Number },
  withdrawalFeePct: { type: Number },
  minWithdrawal:    { type: Number },
  withdrawalDays:   { type: Number },
  signupBonus:      { type: Number },

  // DAILY CHECK-IN — set by admin
  dailyCheckInEnabled: { type: Boolean },
  dailyCheckInAmount:  { type: Number },

  // REFERRAL — set by admin
  referralCommissionPct:   { type: Number },
  referralSystemCutPct:    { type: Number },
  referralTasksToActivate: { type: Number },

  // BADGES — admin adds/edits/removes tiers
  badgeTiers: { type: [badgeTierSchema], default: [] },

  // CAMPAIGNS — set by admin
  autoApproveDays: { type: Number },
  minPayGlobal:    { type: Number },
  categoryMinimums: { type: Map, of: Number, default: {} },

  // ANNOUNCEMENTS — admin posts these
  announcements: { type: [announcementSchema], default: [] },

  // POLLS — admin creates these
  polls: { type: [pollSchema], default: [] },

  // MAINTENANCE — admin toggles
  maintenanceMode:    { type: Boolean },
  maintenanceMessage: { type: String },

}, { timestamps: true });

// Singleton — one settings document ever
settingsSchema.statics.getSingleton = async function () {
  let s = await this.findOne();
  if (!s) s = await this.create({});
  return s;
};

module.exports = mongoose.model("Settings", settingsSchema);
