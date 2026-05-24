//models/ResellerService.js
import mongoose from "mongoose";

const resellerServiceSchema = new mongoose.Schema({
  resellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Service",
    required: true
  },

  visible: {
    type: Boolean,
    default: true
  },

  customName: {
    type: String,
    default: null,
    trim: true,
  },

  customCategory: {
    type: String,
    default: null,
    trim: true,
  },

});

export default mongoose.model("ResellerService", resellerServiceSchema);
