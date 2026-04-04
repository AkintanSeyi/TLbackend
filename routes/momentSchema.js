const express = require("express");
const router = express.Router();
const path = require('path');
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const fs = require('fs');
const User = require("../models/User");
const Group = require("../models/Group");
const Moment = require("../models/momentSchema");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
//const upload = require("../middleware/fileHandler");
const upload = require("../middleware/upload");
const imagekit = require("../middleware/imagekit")
const verifyToken = require("../middleware/verifyToken");
const multer = require("multer");
const Notification = require('../models/Notification');
dotenv.config();

function generateOTP() {
 return Math.floor(1000 + Math.random() * 9000).toString(); 
}

// Replace with env variable in real apps
const JWT_SECRET = "Y4v@tq9!uLz$B8wXp7*MnJ2#KpVc8HdQ";




router.post("/comment", async (req, res) => {
  try {
    const { momentId, userId, text } = req.body;

    const newComment = {
      user: userId,
      text: text,
      createdAt: new Date()
    };

    const updatedMoment = await Moment.findByIdAndUpdate(
      momentId,
      { $push: { comments: newComment } },
      { new: true }
    ).populate("author", "name profileImage")
     .populate("comments.user", "name profileImage"); // Populate user info for the new comment

    res.status(200).json({ success: true, moment: updatedMoment });
  } catch (err) {
    res.status(500).json({ success: false, error: "Comment failed" });
  }
});


router.post("/:momentId/like", async (req, res) => {
  try {
    const { momentId } = req.params;
    const { userId } = req.body;
console.log("Hiiiiiiii")
    const moment = await Moment.findById(momentId);
    if (!moment) return res.status(404).json({ error: "Moment not found" });

    // Toggle Like logic
    const isLiked = moment.likes.includes(userId);
    const update = isLiked 
      ? { $pull: { likes: userId } } 
      : { $addToSet: { likes: userId } };

    const updatedMoment = await Moment.findByIdAndUpdate(
      momentId, 
      update, 
      { new: true }
    );
console.log("11111111111Hiiiiiiii")
    res.status(200).json({ success: true, likes: updatedMoment.likes });
  } catch (err) {
    res.status(500).json({ success: false, error: "Like action failed" });
  }
}); 



// GET moments for a specific user's profile grid
 // Ensure you import your User model

router.get("/user", async (req, res) => {
  try {
    const { email } = req.query; // Accepting email instead of userId
console.log(email)
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // 1. Find the user by email to get their ObjectId
    const user = await User.findOne({ email: email.toLowerCase() });
    
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 2. Use the found user's _id to get their moments
    const moments = await Moment.find({ 
        author: user._id, 
        
      })
      .select("mediaUrl caption createdAt") 
      .sort({ createdAt: -1 });

    // 3. Map mediaUrl to 'image' so your frontend 'item.image' works
    const formattedMoments = moments.map(m => ({
      ...m._doc,
      image: m.mediaUrl 
    }));

    res.status(200).json({ success: true, moments: formattedMoments });
  } catch (err) {
    console.error("Profile Grid Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


router.delete("/:id", async (req, res) => {
  try {
    const moment = await Moment.findById(req.params.id);

    if (!moment) {
      return res.status(404).json({ success: false, message: "Moment not found" });
    }

    // Optional: Add security check here if you pass user info in headers
    // if (moment.author.toString() !== req.user.id) return res.status(401)...

    await Moment.findByIdAndDelete(req.params.id);
    
    res.status(200).json({ success: true, message: "Moment deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/moments/:id
router.get('/:id', async (req, res) => {
  try {
    console.log("Supp")
    const moment = await Moment.findById(req.params.id)
      .populate('author', 'name profileImage') // Get creator details
      .populate({
        path: 'comments.user',
        select: 'name profileImage' // Get details for everyone who commented
      });

    if (!moment) {
      return res.status(404).json({ success: false, message: "Moment not found" });
    }

    res.status(200).json({ success: true, moment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


router.get("/", async (req, res) => {
  try {
    const { userId } = req.query;

    let blockedIds = [];
    
    // Safety check: Only query User if userId is a valid MongoDB ObjectId
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const currentUser = await User.findById(userId);
      blockedIds = currentUser?.blockedUsers || [];
    }

    // Fetch moments
    const moments = await Moment.find({ 
        author: { $nin: [...blockedIds] }, 
        isArchived: false 
      })
      .populate("author", "name profileImage") // Populate the main post author
      .populate({
        path: "comments.user", // Go into comments array, then the user field
        select: "name profileImage" // Only get these fields from the User model
      })
      .sort({ createdAt: -1 }) 
      .limit(20);

    res.status(200).json({ success: true, moments });
  } catch (err) {
    console.error("Backend Error:", err); 
    res.status(500).json({ success: false, error: err.message });
  }
})

router.post("/", upload.single("image"), async (req, res) => {
  try {
    // 1. Destructure fields from body
    // Note: feelingName and feelingEmoji come as separate strings from FormData
    const { author, caption, associatedGroup, feelingName, feelingEmoji } = req.body;

    // Logs for debugging (matching your style)
    console.log("--- Creating New Moment ---");
    console.log("Author ID:", author);
    console.log("Feeling:", feelingName, feelingEmoji);
    console.log("File Received:", req.file ? "Yes" : "No");

    // 2. Validation check
    if (!author || !req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "Author ID and an image are required to post a moment." 
      });
    }

    // 3. Prepare Moment Data Object
    let momentData = {
      author,
      caption,
      associatedGroup: associatedGroup || null,
      // Nest the feelings into the object structure defined in the model
      feeling: {
        name: feelingName || "",
        emoji: feelingEmoji || ""
      }
    };

    // 4. Handle Image Upload via ImageKit
    if (req.file) {
      const uploadResult = await imagekit.upload({
        file: req.file.buffer,
        fileName: `moment_${Date.now()}_${req.file.originalname}`,
        folder: "/moments",
      });
      
      // Map ImageKit response to your schema fields
      momentData.mediaUrl = uploadResult.url;
      momentData.mediaId = uploadResult.fileId;
    }

    // 5. Save to Database
    const newMoment = new Moment(momentData);
    await newMoment.save();

    // 6. Send Response
    // We populate the author so the frontend gets the name/image immediately
    const populatedMoment = await Moment.findById(newMoment._id).populate("author", "name profileImage");

    res.status(201).json({
      success: true,
      message: "Moment shared successfully!",
      moment: populatedMoment
    });

  } catch (error) {
    console.error("Create Moment Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error", 
      error: error.message 
    });
  }
});



module.exports = router;