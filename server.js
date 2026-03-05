import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "./app.js";
import http from "http";
import { Server } from "socket.io";

/* NEW: Provider sync service */
import { startProviderStatusSync } from "./services /providerStatusSync.js";

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const PORT = process.env.PORT || 10000;

// Wrap Express app in HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with proper CORS
export const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // allow requests with no origin (Postman, server-side)
      if (!origin) return callback(null, true);

      // whitelist allowed domains
      const allowedOrigins = [
        "https://marinepanel.online",
        "http://marinepanel.online",
        "https://www.marinepanel.online",
        "http://www.marinepanel.online",
      ];

      // allow Vercel preview URLs
      if (/\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.log("Blocked by Socket.IO CORS:", origin);
        return callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Make io accessible in routes/controllers via app.set (optional)
app.set("io", io);

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  /* user joins their own room */
  socket.on("join_user_room", (userId) => {
    socket.join(userId);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

/* ========================================
   START PROVIDER ORDER STATUS SYNC
======================================== */
startProviderStatusSync(io);

// Start server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
