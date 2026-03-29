const express = require("express");
const router = express.Router();
const User = require("../models/User");
//const user  = require("../models/User")
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const upload = require("./../middleware/upload");
const imagekit = require("../middleware/imagekit");
const sendPushNotification = require("../middleware/sendPushNotification");
const { sendEmail } = require("../middleware/sendemail"); 
const Message = require("../models/Message")
const Conversation = require("../models/Conversation")
const Notification = require('../models/Notification');



// Replace with env variable in real apps
const JWT_SECRET = "Y4v@tq9!uLz$B8wXp7*MnJ2#KpVc8HdQ";

const resetCodes = {};

function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}



router.post("/messages", upload.single('image'), async (req, res) => {
  const { conversationId, senderId, text } = req.body;
  let fileUrl = null;

  try {
    // 1. Upload to ImageKit
    if (req.file) {
      const uploadResult = await imagekit.upload({
        file: req.file.buffer,
        fileName: `msg_${Date.now()}_${req.file.originalname}`,
        folder: "/chat_messages",
      });
      fileUrl = uploadResult.url;
    }

    // 2. Save Message
    const newMessage = await Message.create({
      conversationId,
      sender: senderId,
      text: text || "",
      messageType: req.file ? 'image' : 'text',
      fileUrl: fileUrl,
      status: 'sent'
    });

    const populatedMessage = await newMessage.populate("sender", "name profileImage");

    // 3. Update Conversation
    const updatedConvo = await Conversation.findByIdAndUpdate(
      conversationId, 
      { lastMessage: newMessage._id },
      { new: true }
    );

    // 4. Socket Emit
    if (req.io) {
      req.io.to(conversationId).emit("receive_message", populatedMessage);
    }

    // 5. 🚀 FIXED PUSH NOTIFICATION LOGIC
    if (updatedConvo && updatedConvo.participants) {
      const recipientIds = updatedConvo.participants.filter(
        (id) => id.toString() !== senderId.toString()
      );

      const recipients = await User.find({ _id: { $in: recipientIds } });

      recipients.forEach((recipient) => {
        // Since your model is [String], we check if it exists and has length
        if (recipient.expoPushToken && recipient.expoPushToken.length > 0) {
          const pushTitle = `New message from ${populatedMessage.sender.name}`;
          const pushBody = req.file ? "📷 Sent an image" : (text || "New message");

          // ✅ CLEAN FIX: Flatten the token array. 
          // If your DB has ["Token1"], this ensures we pass ["Token1"] to the helper.
          const finalTokens = Array.isArray(recipient.expoPushToken) 
            ? recipient.expoPushToken 
            : [recipient.expoPushToken];

          sendPushNotification(
            finalTokens, 
            pushTitle,
            pushBody,
            { 
              type: 'chat', 
              conversationId, 
              senderName: populatedMessage.sender.name 
            }
          ).catch(err => console.error("Push Notification Error:", err));
        }
      });
    }

    res.status(201).json(populatedMessage);
  } catch (err) {
    console.error("Message Processing Error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});






router.get("/messages/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    const messages = await Message.find({ conversationId })
      .populate("sender", "name email") // Only get name and email of sender
      .sort({ createdAt: -1 }) // Sort by newest first (good for FlatList 'inverted')
      .limit(50); // Pagination: start with last 50 messages

    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch messages" });
  }
});


router.get("/messages/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    const messages = await Message.find({ conversationId })
      .populate("sender", "name email") // Only get name and email of sender
      .sort({ createdAt: -1 }) // Sort by newest first (good for FlatList 'inverted')
      .limit(50); // Pagination: start with last 50 messages

    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch messages" });
  }
}); 



// routes/conversations.js
// --- CREATE OR GET CONVERSATION ---
router.post("/conversations", async (req, res) => {
  const { senderId, receiverId } = req.body;
  
  try {
    // 1. Changed "members" to "participants" to match your Schema
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] }
    }).populate("participants", "name profileImage"); // Populate participants

    if (conversation) {
      return res.status(200).json({ success: true, conversation });
    }

    // 2. Changed "members" to "participants" here as well
    conversation = await Conversation.create({
      participants: [senderId, receiverId]
    });

    // Populate the newly created conversation before sending back
    const populatedConvo = await Conversation.findById(conversation._id)
      .populate("participants", "name profileImage");

    res.status(201).json({ success: true, conversation: populatedConvo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


router.get("/conversations/:userId", async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: { $in: [req.params.userId] }
    })
    .populate({
      path: "participants",
      select: "name profileImage" 
    })
    .populate("lastMessage") 
    .sort({ updatedAt: -1 });

    // --- LOGGING SECTION ---
    console.log("--- Conversation Participants Names ---");
    conversations.forEach((convo, index) => {
      const names = convo.participants.map(p => p.name || "NULL/UNDEFINED");
      console.log(`Convo ${index + 1} (${convo._id}):`, names);
    });
    console.log("---------------------------------------");
    // -----------------------

    res.status(200).json(conversations);
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ error: "Could not fetch conversations" });
  }
});
module.exports = router;