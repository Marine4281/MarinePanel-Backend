import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "./app.js";
import http from "http";
import { Server } from "socket.io";

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
      // allow requests with no origin (like Postman)
      if (!origin) return callback(null, true);

      // allow production frontend + Vercel preview URLs
      if (
        origin === "https://marinepanel.online" || // ✅ include https://
        /\.vercel\.app$/.test(origin)
      ) {
        callback(null, true);
      } else {
        console.log("Blocked by Socket.IO CORS:", origin);
        callback(new Error("Not allowed by CORS")); // block other origins
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

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Start server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
