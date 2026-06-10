import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender:      { type: String, enum: ["user", "admin"], required: true },
    senderName:  { type: String, default: "" },
    text:        { type: String, default: "" },
    file: {
      data:     { type: String },
      mimeType: { type: String },
      fileName: { type: String },
    },
    seenByAdmin: { type: Boolean, default: false },
    seenByUser:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

const ticketCategorySchema = new mongoose.Schema(
  {
    label:     { type: String, required: true, trim: true },
    isVisible: { type: Boolean, default: true },
    scope:     { type: String, enum: ["main", "childPanel"], default: "main" },
    panelOwner:{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

const ticketSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // scope: "main" = handled by main admin, "childPanel" = handled by CP owner
    scope:       { type: String, enum: ["main", "childPanel"], default: "main" },
    panelOwner:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    title:       { type: String, required: true, trim: true },
    status:      { type: String, enum: ["open", "in_progress", "closed"], default: "open" },
    messages:    [messageSchema],
  },
  { timestamps: true }
);

export const TicketCategory = mongoose.model("PanelTicketCategory", ticketCategorySchema);
export const SupportTicket  = mongoose.model("PanelSupportTicket", ticketSchema);
