const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http"); // You imported this
const dotenv = require("dotenv");
const path = require("path");
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create the HTTP server using the Express app
const server = http.createServer(app); 

const io = new Server(server, {
  cors: {
    origin: "*", // In production, replace with your specific origin
    methods: ["GET", "POST"]
  }
});


io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // User joins a specific chat room
  socket.on("join_room", (conversationId) => {
    socket.join(conversationId);
    console.log(`User joined room: ${conversationId}`);
  });

  // Handling sending a message
  socket.on("send_message", (data) => {
    // data should contain: conversationId, senderId, text, messageType, etc.
    
    // Broadcast to everyone in the room (including other devices of the sender)
    io.to(data.conversationId).emit("receive_message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ Routes
// server.js
app.use((req, res, next) => {
  req.io = io; // Attach socket instance to every request
  next();
});
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/post"));
app.use("/api/notifications", require("./routes/notification"));
app.use("/api/groups", require("./routes/grouppost"));
app.use("/api/message", require("./routes/conversation"));
app.use("/api/payments", require("./routes/payment"));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));


app.get("/", (req, res) => {
  res.send("🚀 Server is up and running!");
});

// ✅ MongoDB + Server start
async function startServer() {
  try {
    // 1. Log the URL to see if it is being read correctly
   
    if (!process.env.CONNECTION_URL) {
       throw new Error("CONNECTION_URL is missing from .env file!");
    }

    await mongoose.connect(process.env.CONNECTION_URL);
    console.log("✅ MongoDB Connected Successfully");

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
    
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}

startServer();