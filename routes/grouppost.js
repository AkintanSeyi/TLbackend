
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




router.post("/create-post", async (req, res) => {
  try {
    const { groupId, author, content, image } = req.body;

    if (!groupId || !author || !content) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // 1. Create Post
    const newPost = new Post({ groupId, author, content, image });
    await newPost.save();

    // 2. Fetch Group & Author (Needed for notification content)
    const group = await Group.findById(groupId);
    const postAuthor = await User.findById(author);

    if (group) {
      // 3. Filter members: 
      // - Must not be the author
      // - Must NOT have notificationsEnabled explicitly set to false
      const membersToNotify = group.members.filter(m => 
        m.user && 
        m.user.toString() !== author.toString() && 
        m.notificationsEnabled !== false
      );

      // 4. Create Notifications
      const notificationPromises = membersToNotify.map(member => {
        return new Notification({
          recipient: member.user,
          sender: author,
          type: 'new_post',
          group: groupId,
          post: newPost._id,
          content: `${postAuthor.name} posted in ${group.name}`
        });
      });

      // Using insertMany is faster for multiple records
      if (notificationPromises.length > 0) {
        await Notification.insertMany(notificationPromises);
      }
    }

    const populatedPost = await Post.findById(newPost._id).populate('author', 'name profileImage');
    res.status(201).json({ success: true, post: populatedPost });
    
  } catch (error) {
    console.error("POST ERROR:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// TOGGLE LIKE (Smart Logic)
router.post("/posts/like", async (req, res) => {
  try {
    const { postId, userId } = req.body;
    
    // 1. Populate 'author' so we can get the owner's ID and Name
    const post = await Post.findById(postId).populate('author', 'name');
    if (!post) return res.status(404).json({ message: "Post not found" });

    // 2. Get the person who is liking the post (the sender)
    const liker = await User.findById(userId);

    const isLiked = post.likes.includes(userId);

    if (isLiked) {
      post.likes.pull(userId);
    } else {
      post.likes.addToSet(userId);

      // 3. TRIGGER NOTIFICATION
      // Only notify if the person liking isn't the owner of the post
      if (post.author._id.toString() !== userId.toString()) {
        await new Notification({
          recipient: post.author._id, // The post owner
          sender: userId,             // The person who liked
          type: 'like',
          post: postId,
          group: post.groupId,        // Assuming your Post model has groupId
          content: `${liker.name} liked your post: "${post.content.substring(0, 20)}..."`
        }).save();
      }
    }

    await post.save();
    res.status(200).json({ success: true, likes: post.likes });
  } catch (error) {
    console.error("LIKE ERROR:", error);
    res.status(500).json({ success: false });
  }
});

// GET POSTS FOR GROUP
router.get("/:groupId/posts", async (req, res) => {
  try {
    const { groupId } = req.params;

    // FIX: If groupId is undefined or not a valid ID, return 400 instead of crashing with 500
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

    const posts = await Post.find({ groupId: groupId })
      .populate('author', 'name profileImage')
      .populate('comments.user', 'name profileImage')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, posts });
  } catch (error) {
    console.error(error); // This lets you see the error in your terminal
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// ADD A COMMENT
router.post("/posts/comment", async (req, res) => {
  try {
    const { postId, userId, text } = req.body;

    if (!postId || !userId || !text) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // 1. Find the post and the commenter
    const post = await Post.findById(postId);
    const commenter = await User.findById(userId);

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // 2. Add the comment to the array
    post.comments.push({
      user: userId,
      text: text,
      createdAt: new Date()
    });

    await post.save();

    // 3. TRIGGER NOTIFICATION
    // Only notify if the commenter isn't the owner of the post
    if (post.author.toString() !== userId.toString()) {
      await new Notification({
        recipient: post.author, // The post owner
        sender: userId,         // The person who commented
        type: 'comment',
        post: postId,
        group: post.groupId,    // Link to the group
        content: `${commenter.name} commented on your post: "${text.substring(0, 20)}..."`
      }).save();
    }

    // 4. Return populated post for the UI
    const updatedPost = await Post.findById(postId)
      .populate('comments.user', 'name profileImage')
      .populate('author', 'name');

    res.status(200).json({ 
      success: true, 
      message: "Comment added", 
      post: updatedPost 
    });
  } catch (error) {
    console.error("Comment Error:", error);
    res.status(500).json({ success: false, message: "Error adding comment" });
  }
});

// GET GROUP ANALYTICS (Admin only)
router.get("/:id/analytics", async (req, res) => {
  try {
    const { id } = req.params;
    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    const now = new Date();
    
    // Start of Current Week (Sunday 00:00:00)
    const startOfCurrentWeek = new Date(now);
    startOfCurrentWeek.setDate(now.getDate() - now.getDay());
    startOfCurrentWeek.setHours(0, 0, 0, 0);

    // Start of Last Week
    const startOfLastWeek = new Date(startOfCurrentWeek);
    startOfLastWeek.setDate(startOfCurrentWeek.getDate() - 7);

    // Calculate stats from members array
    let currentWeekJoins = 0;
    let lastWeekJoins = 0;

    group.members.forEach((member) => {
      const joinDate = new Date(member.joinedAt);
      if (joinDate >= startOfCurrentWeek) {
        currentWeekJoins++;
      } else if (joinDate >= startOfLastWeek && joinDate < startOfCurrentWeek) {
        lastWeekJoins++;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        totalMembers: group.memberCount || group.members.length,
        currentWeekJoins,
        lastWeekJoins,
      },
    });
  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({ success: false, message: "Error fetching analytics" });
  }
});





module.exports = router;