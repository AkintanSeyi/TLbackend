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

// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Add your key to .env

// // 1. Create Payment Intent
// router.post("/create-intent", async (req, res) => {
//   try {
//     const { groupId, userId } = req.body;
    
//     // Fetch the group to get the actual price
//     const group = await Group.findById(groupId);
//     if (!group) return res.status(404).json({ success: false, message: "Group not found" });

//     // Stripe uses cents. If price is 10, amount must be 1000.
//     // Use group price or default to 10 if not set
//     const finalPrice = group.price && group.price > 0 ? group.price : 10;
//     const amount = Math.round(finalPrice * 100); 

//     const paymentIntent = await stripe.paymentIntents.create({
//       amount,
//       currency: 'usd',
//       metadata: { groupId, userId },
//       automatic_payment_methods: { enabled: true },
//     });

//     res.status(200).json({ 
//       success: true, 
//       clientSecret: paymentIntent.client_secret 
//     });
//   } catch (error) {
//     console.error("Stripe Intent Error:", error);
//     res.status(500).json({ success: false, message: error.message });
//   }
// });

// 2. Verify and Join
// router.post("/verify-and-join", async (req, res) => {
//   try {
//     const { groupId, userId, paymentIntentId } = req.body;
    
//     // SECURE VERIFICATION: Check with Stripe that payment actually succeeded
//     const payment = await stripe.paymentIntents.retrieve(paymentIntentId);
//     if (payment.status !== 'succeeded') {
//         return res.status(400).json({ success: false, message: "Payment not verified" });
//     }

//     const group = await Group.findById(groupId);
//     const user = await User.findById(userId);

//     if (!group || !user) return res.status(404).json({ success: false, message: "Data not found" });

//     const isAlreadyMember = group.members.some(m => m.user.toString() === userId.toString());
//     if (isAlreadyMember) {
//         return res.status(200).json({ success: true, message: "Already a member" });
//     }

//     group.members.push({ 
//       user: userId, 
//       role: 'member', 
//       joinedAt: new Date(),
//       notificationsEnabled: true 
//     });
    
//     group.memberCount = group.members.length;
//     await group.save();

//     if (group.creator.toString() !== userId.toString()) {
//       await new Notification({
//         recipient: group.creator,
//         sender: userId,
//         type: 'new_member',
//         group: groupId,
//         content: `${user.name} paid and joined your group: ${group.name}`
//       }).save();
//     }

//     res.status(200).json({ success: true, message: "Welcome to the community!" });
//   } catch (error) {
//     console.error("Payment Join Error:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// });


module.exports = router;