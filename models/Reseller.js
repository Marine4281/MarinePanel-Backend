// models/Reseller.js

import mongoose from "mongoose";

const resellerSchema = new mongoose.Schema({

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  brandName: {
    type: String,
    required: true
  },

  logo: {
    type: String,
    default: null
  },

  domain: {
    type: String,
    unique: true,
    sparse: true
  },

  subdomain: {
    type: String,
    unique: true,
    sparse: true
  },

  themeColor: {
    type: String,
    default: "#16a34a"   // green
  },

  isActive: {
    type: Boolean,
    default: true
  }

}, { timestamps: true });

export default mongoose.model("Reseller", resellerSchema);
