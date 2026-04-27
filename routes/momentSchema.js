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

router.post("/toggle-bookmark", async (req, res) => {
  try {
    const { userId, itemId, itemType } = req.body; // itemType: 'group' or 'moment'

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Determine which array to update
    const field = itemType === 'moment' ? 'savedMoments' : 'savedPosts';
    
    const isBookmarked = user[field].includes(itemId);

    if (isBookmarked) {
      // Pull (Remove) from array
      user[field].pull(itemId);
    } else {
      // Push (Add) to array
      user[field].push(itemId);
    }

    await user.save();
    res.status(200).json({ success: true, isBookmarked: !isBookmarked });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
    const { email, type } = req.query; // 'type' can be 'posts' or 'tags'
    
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let query = {};

    if (type === 'tags') {
      // 1. GET TAGS: You are mentioned, but you are NOT the author
      query = { 
        mentions: user._id, 
        author: { $ne: user._id } 
      };
    } else {
      // 2. GET POSTS: You are the author
      query = { author: user._id };
    }

    const moments = await Moment.find(query)
      .populate("author", "name profileImage") // Important to see who tagged you
      .sort({ createdAt: -1 });

    // Map mediaUrl to 'image' for your frontend compatibility
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
     console.log("Supp")
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
    const { author, caption, associatedGroup, feelingName, feelingEmoji, mediaType } = req.body;

    console.log("--- Creating New Moment ---");
    console.log("Author ID:", author);
    console.log("Media Type:", mediaType);
    console.log("File Received:", req.file ? "Yes" : "No");

    // 2. Validation check
    if (!author || !req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "Author ID and a media file are required." 
      });
    }

    // --- NEW: MENTION EXTRACTION LOGIC ---
    // Extract @mentions from the caption
   const mentionNames = caption ? caption.match(/@(\w+)/g) || [] : [];
let mentionIds = [];

if (mentionNames.length > 0) {
  // Remove '@'
  const cleanNames = mentionNames.map(name => name.substring(1));

  // Find users where the name (ignoring spaces/case) matches the mention
  const allUsers = await User.find({}).select('_id name');
  
  mentionIds = allUsers.filter(u => {
    const formattedName = u.name.toLowerCase().replace(/\s/g, '');
    return cleanNames.includes(formattedName);
  }).map(u => u._id);
}
    // Also keeping hashtag extraction if present
    const hashtags = caption ? caption.match(/#(\w+)/g) || [] : [];
    // -------------------------------------

    // 3. Prepare Moment Data Object
    let momentData = {
      author,
      caption,
      mediaType: mediaType || 'image',
      associatedGroup: associatedGroup || null,
      feeling: {
        name: feelingName || "",
        emoji: feelingEmoji || ""
      },
      // Adding these to the object to be saved
      mentions: mentionIds, 
      tags: hashtags        
    };

    // 4. Handle Upload via ImageKit
    if (req.file) {
      const uploadResult = await imagekit.upload({
        file: req.file.buffer,
        fileName: `moment_${Date.now()}_${req.file.originalname}`,
        folder: "/moments",
      });
      
      momentData.mediaUrl = uploadResult.url;
      momentData.mediaId = uploadResult.fileId;
    }

    // 5. Save to Database
    const newMoment = new Moment(momentData);
    await newMoment.save();

    // 6. Send Response (Populating mentions and using profilePicture as per your model)
    const populatedMoment = await Moment.findById(newMoment._id)
      .populate("author", "name profilePicture")
      .populate("mentions", "name username profilePicture");

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