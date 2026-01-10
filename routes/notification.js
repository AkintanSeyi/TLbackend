const express = require("express");
const router = express.Router();
const path = require('path');
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const fs = require('fs');
const User = require("../models/User");
const Group = require("../models/Group");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const nodemailer = require("nodemailer");

const Post = require('../models/Post');
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



router.get("/:userId", async (req, res) => {
    console.log(req.params.userId)
  try {
    const notifications = await Notification.find({ recipient: req.params.userId })
      .populate('sender', 'name profileImage') // Required for the sender's name
      .populate('group', 'name')             // Required for the group name
      .sort({ createdAt: -1 });

       console.log(notifications.length)
      
    res.status(200).json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});


router.patch("/:groupId/notifications", async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });

    // Find member
    const member = group.members.find(m => m.user.toString() === userId.toString());

    if (!member) {
      return res.status(403).json({ success: false, message: "User is not a member" });
    }

    // Toggle the value
    member.notificationsEnabled = !member.notificationsEnabled;

    // 🔥 THIS IS THE FIX: Tell Mongoose the 'members' array has changed
    group.markModified('members'); 

    await group.save();

    res.status(200).json({ 
      success: true, 
      notificationsEnabled: member.notificationsEnabled 
    });
  } catch (error) {
    console.error("Toggle Error:", error);
    res.status(500).json({ success: false });
  }
});


module.exports = router;