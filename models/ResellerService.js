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
  }

});

export default mongoose.model("ResellerService", resellerServiceSchema);
