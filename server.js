import mongoose from "mongoose";
import dotenv from "dotenv";
import app, { isAllowedOrigin } from "./app.js";
import http from "http";
import { Server } from "socket.io";

/* CRON JOBS */
import { startOrderSyncJob } from "./jobs/orderSyncJob.js";
import { startRefillSyncJob } from "./jobs/refillSyncJob.js";
import { startBillingCronJob } from "./jobs/billingCronJob.js";

dotenv.config();

/* ========================================
   🗄️ CONNECT TO MONGODB
======================================== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.log("❌ MongoDB error:", err));

const PORT = process.env.PORT || 10000;

/* ========================================
   🌐 CREATE HTTP SERVER
======================================== */
const server = http.createServer(app);

/* ========================================
   🔌 SOCKET.IO SETUP
======================================== */
export const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      console.log("🚫 Blocked by Socket.IO CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

/* Make io accessible in routes/controllers */
app.set("io", io);

/* ========================================
   🔗 SOCKET CONNECTION
======================================== */
io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  socket.on("join_user_room", (userId) => {
    socket.join(userId);
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

/* ========================================
   ⏱️ START CRON JOBS
======================================== */
startBillingCronJob();
startOrderSyncJob(io);
startRefillSyncJob();

/* ========================================
   🚀 START SERVER
======================================== */
server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
