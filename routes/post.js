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

router.post("/create-group", upload.single("profilePicture"), async (req, res) => {
  try {
    // 1. Destructure fields from body including the new 'price'
    // Logic Kept: All previous fields are still here
    let { name, description, category, isPrivate, creator, price } = req.body;
    
    // Logic Kept: Your console logs for debugging
    console.log("Hiiiiii")
    console.log("Content-Type:", req.headers['content-type']); 
    console.log("Body Name:", req.body.name);
    console.log("File Data:", req.file);

    // Logic Kept: Validation check
    if (!name || !creator) {
      return res.status(400).json({ message: "Group name and creator ID are required" });
    }

    // --- LOGIC FOR FREE VS PAID ---
    // Convert price to a clean number
    const numericPrice = price ? Number(price) : 0;
    
    // Determine privacy based on price if not explicitly handled
    // If price is 0, it's a free group (usually public). 
    // If price > 0, it's a paid group (usually private/locked).
    let finalIsPrivate = isPrivate === 'true' || isPrivate === true;
    
    if (numericPrice > 0) {
        finalIsPrivate = true; // Paid groups should be private/protected
    } else {
        finalIsPrivate = false; // Free groups are public
    }

    // 2. Prepare Group Data Object
    // Logic Kept: 'isPrivate' boolean conversion and 'members' initialization
    let groupData = {
      name,
      description,
      category,
      price: numericPrice, // ✅ Convert price string to Number
      isPrivate: finalIsPrivate,
      creator,
      members: [{ user: creator, role: 'admin' }],
      profilePicture: "https://example.com/default-group-icon.png" 
    };

    // 3. Handle Image Upload
    // Logic Kept: ImageKit logic remains untouched
    if (req.file) {
      const uploadResult = await imagekit.upload({
        file: req.file.buffer,
        fileName: `group_${Date.now()}_${req.file.originalname}`,
        folder: "/groups",
      });
      groupData.profilePicture = uploadResult.url;
      groupData.profilePictureId = uploadResult.fileId;
    }

    // 4. Save to Database
    const newGroup = new Group(groupData);
    console.log(newGroup)
    await newGroup.save();

    // 5. Send Response
    // Logic Kept: Response structure is identical + added price to the return object
    res.status(201).json({
      success: true,
      message: "Group created successfully",
      group: {
        id: newGroup._id,
        name: newGroup.name,
        category: newGroup.category,
        price: newGroup.price, // ✅ Return the price in response
        isPrivate: newGroup.isPrivate,
        profilePicture: newGroup.profilePicture,
        creator: newGroup.creator
      }
    });

  } catch (error) {
    console.error("Create Group Error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});


// GET the 10 most recent groups (Filtering out blocked users & their comments)
router.get("/latest-groups", async (req, res) => {
  try {
    const { userId } = req.query;

    let blockedList = [];

    if (userId && userId !== 'null') {
      const user = await User.findById(userId);
      if (user && user.blockedUsers) {
        // Convert IDs to strings for easy comparison later
        blockedList = user.blockedUsers.map(id => id.toString());
      }
    }

    const latestGroups = await Group.find({
      creator: { $nin: blockedList } 
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("creator", "name profilePicture category")
      .populate("comments.user", "name profileImage");

    // --- LOGIC TO REMOVE BLOCKED COMMENTS ---
    const cleanedGroups = latestGroups.map(group => {
      const g = group.toObject(); // Convert Mongoose document to plain JS object
      
      if (g.comments && g.comments.length > 0) {
        g.comments = g.comments.filter(comment => {
          // Handle cases where user might be populated or just an ID
          const commentAuthorId = comment.user?._id?.toString() || comment.user?.toString();
          
          // Return true only if the author is NOT in the blocked list
          return !blockedList.includes(commentAuthorId);
        });
      }
      return g;
    });

    res.status(200).json({
      success: true,
      count: cleanedGroups.length,
      groups: cleanedGroups // Send the cleaned data
    });
  } catch (error) {
    console.error("Fetch Latest Groups Error:", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
});




// POST /api/groups/:id/like
router.post("/:id/like", async (req, res) => {
  try {
    const groupId = req.params.id;
    // SINCE NO MIDDLEWARE: Get userId sent from the frontend body
    const { userId } = req.body; 

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: "User ID is required in the request body" 
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    // Initialize likes array if it's missing
    if (!group.likes) group.likes = [];

    // Check if user already liked it (compare as Strings)
    const isLiked = group.likes.some(id => id.toString() === userId.toString());

    if (!isLiked) {
      // Add like
      group.likes.push(userId);
    } else {
      // Remove like (Unlike)
      group.likes = group.likes.filter(id => id.toString() !== userId.toString());
    }

    await group.save();

    res.status(200).json({ 
      success: true, 
      likesCount: group.likes.length,
      likes: group.likes 
    });

  } catch (error) {
    console.error("Like Route Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});








// COMMENT on a group

router.post("/posthome/:id/comment", async (req, res) => {
  try {
    const { text, userId } = req.body; 
    
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });

    const newComment = {
      user: userId, 
      text: text,
      createdAt: new Date()
    };

    group.comments.unshift(newComment); 
    await group.save();

    // 1. Get the current user to find who they blocked
    const currentUser = await User.findById(userId);
    const blockedList = currentUser?.blockedUsers?.map(id => id.toString()) || [];

    // 2. Populate and filter out blocked comments immediately
    const updatedGroup = await Group.findById(req.params.id)
      .populate("creator", "name profilePicture category")
      .populate("comments.user", "name profileImage");

    const groupObj = updatedGroup.toObject();
    if (groupObj.comments) {
      groupObj.comments = groupObj.comments.filter(c => {
        const authorId = c.user?._id?.toString() || c.user?.toString();
        return !blockedList.includes(authorId);
      });
    }

    res.status(200).json({ 
      success: true, 
      post: groupObj 
    });
  } catch (error) {
    console.error("Comment Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// DELETE COMMENT ROUTE
router.delete("/posthome/:id/comment/:commentId", async (req, res) => {
  try {
    const { userId } = req.body; 
    const { id, commentId } = req.params;

    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });

    // Remove the comment
    group.comments.pull(commentId);
    await group.save();

    // Populate so the frontend gets updated names/images
    const updatedGroup = await Group.findById(id)
      .populate("creator", "name profilePicture category")
      .populate("comments.user", "name profileImage");

    res.status(200).json({ success: true, post: updatedGroup });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// backend/routes/group.js


router.get("/all-groups", async (req, res) => {
  try {
    const { category, search, userId, page = 1, limit = 10 } = req.query;
    let blockedList = [];

    // 1. Get the current user's block list
    if (userId && userId !== 'null') {
      const user = await User.findById(userId);
      if (user) blockedList = user.blockedUsers || [];
    }

    // 2. Filter Groups: Hide groups created by blocked users
    let query = {
      creator: { $nin: blockedList } 
    };

    if (category && category !== 'All') query.category = category;
    if (search) query.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;

    const groups = await Group.find(query)
      .sort({ memberCount: -1 })
      .skip(skip)
      .limit(limit)
      .populate("creator", "name profilePicture")
      .populate("comments.user", "name profileImage");

    // 3. Filter Comments: Remove comments inside the group from blocked users
    const filteredGroups = groups.map(group => {
      const g = group.toObject();
      if (g.comments) {
        g.comments = g.comments.filter(c => {
          const authorId = c.user?._id || c.user;
          return !blockedList.map(id => id.toString()).includes(authorId?.toString());
        });
      }
      return g;
    });

    const totalGroups = await Group.countDocuments(query);

    res.status(200).json({
      success: true,
      totalPages: Math.ceil(totalGroups / limit),
      groups: filteredGroups 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



router.put("/update-privacy", async (req, res) => {
  try {
    const { email, isPrivate } = req.body;
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { isPrivate },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    console.log(user.isPrivate)

    res.status(200).json({ success: true, isPrivate: user.isPrivate });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// routes/auth.js

// 1. GET BLOCKED USERS
router.get("/blocked-users/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() })
      .populate('blockedUsers', 'name profileImage email'); // Populate only needed fields

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ success: true, blockedUsers: user.blockedUsers });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// 2. UNBLOCK USER
router.post("/unblock-user", async (req, res) => {
  try {
    const { currentUserId, blockUserId } = req.body;

    // Log this to your terminal to see if keys are actually arriving
    console.log("Unblock Request Body:", req.body);

    if (!currentUserId || !blockUserId) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing IDs. Received: currentUserId=${currentUserId}, blockUserId=${blockUserId}` 
      });
    }

    // 1. Find your user
    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Your user account not found" });
    }

    // 2. Remove the user from the array
    // We use .toString() to filter them out safely
    user.blockedUsers = user.blockedUsers.filter(
      (id) => id.toString() !== blockUserId.toString()
    );

    await user.save();

    console.log(`Success: User ${blockUserId} unblocked.`);
    
    res.status(200).json({ 
      success: true, 
      message: "User unblocked successfully",
      blockedCount: user.blockedUsers.length 
    });
  } catch (error) {
    console.error("Unblock Route Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// routes/group.js
router.get("/user-memberships/:email", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // Load 10 per request
    const skip = (page - 1) * limit;

    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    const groups = await Group.find({ "members.user": user._id })
      .sort({ updatedAt: -1 }) // Show newest first
      .skip(skip)
      .limit(limit)
      .populate('creator', 'name');

    res.status(200).json({ success: true, groups });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get single group details
router.get("/group-details/:id", async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('members.user', 'name profileImage email') // Get member details
      .populate('creator', 'name');

    if (!group) return res.status(404).json({ message: "Group not found" });
    res.status(200).json({ success: true, group });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// router.delete("/posts/:postId", async (req, res) => ...



router.post("/toggle-membership", async (req, res) => {
  try {
    const { groupId, userEmail } = req.body; 
    console.log(userEmail)

    // 1. Safety Check: Ensure data was sent
    if (!groupId || !userEmail) {
      return res.status(400).json({ success: false, message: "Missing Group ID or Email" });
    }

    const user = await User.findOne({ email: userEmail });
    const group = await Group.findById(groupId);

    // 2. Safety Check: Ensure User and Group exist in DB
    if (!user || !group) {
      return res.status(404).json({ success: false, message: "User or Group not found" });
    }

    // Check if already a member
    const isMember = group.members.some(m => 
      m.user && m.user.toString() === user._id.toString()
    );

    if (isMember) {
      // LEAVE Logic
      group.members = group.members.filter(m => 
        m.user && m.user.toString() !== user._id.toString()
      );
    } else {
      // JOIN Logic
      // Block if group has a price and is private
      if (group.isPrivate && group.price > 0) {
        return res.status(403).json({ 
          success: false, 
          message: "This is a paid private group. Please complete payment to join." 
        });
      }

      group.members.push({ 
        user: user._id, 
        role: 'member', 
        joinedAt: new Date(),
        notificationsEnabled: true 
      });

      // Notify Leader (Check if Notification model exists and creator exists)
      if (group.creator && group.creator.toString() !== user._id.toString()) {
        try {
            await new Notification({
                recipient: group.creator,
                sender: user._id,
                type: 'new_member',
                group: groupId,
                content: `${user.name} joined your group: ${group.name}`
            }).save();
        } catch (notifErr) {
            console.log("Notification failed to save, but joining continued.");
        }
      }
    }

    // Update the counter
    group.memberCount = group.members.length;

    await group.save();
    res.status(200).json({ success: true, isMember: !isMember });

  } catch (error) {
    console.error("DETAILED ERROR:", error); // Check your terminal for this!
    res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
});



router.get("/user-profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    let requesterId = null;

    // 1. Extract Requester from Token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      requesterId = decoded.userId || decoded.id;
    }

    // 2. Fetch both users in parallel for speed and accuracy
    const [targetUser, me] = await Promise.all([
      User.findById(userId).select("name username profileImage bio isPrivate interests blockedUsers"),
      requesterId ? User.findById(requesterId).select("blockedUsers") : null
    ]);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 3. Strict Comparison Logic
    let isBlockedByMe = false;
    let hasBlockedMe = false;

    if (me && me.blockedUsers) {
      // Use .some() with .toString() to force a match
      isBlockedByMe = me.blockedUsers.some(id => id.toString() === userId.toString());
    }

    if (targetUser && targetUser.blockedUsers && requesterId) {
      hasBlockedMe = targetUser.blockedUsers.some(id => id.toString() === requesterId.toString());
    }

    // --- CRITICAL DEBUG LOGS ---
    console.log(`Checking block between ${requesterId} and ${userId}`);
    console.log(`isBlockedByMe: ${isBlockedByMe}`);
    console.log(`hasBlockedMe: ${hasBlockedMe}`);

    // 4. Response
    const publicData = {
      _id: targetUser._id,
      name: targetUser.name,
      username: targetUser.username,
      profileImage: targetUser.profileImage,
      isPrivate: targetUser.isPrivate
    };

    if (isBlockedByMe || hasBlockedMe || (targetUser.isPrivate && requesterId?.toString() !== userId.toString())) {
      return res.status(200).json({
        success: true,
        isBlockedByMe,
        hasBlockedMe,
        user: publicData
      });
    }

    res.status(200).json({ 
      success: true, 
      isBlockedByMe, 
      hasBlockedMe, 
      user: targetUser 
    });

  } catch (error) {
    console.error("Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// router.post("/block-user", ...)
// router.post("/block-user", authMiddleware, async (req, res) => {
router.post("/block-user", async (req, res) => {
  try {
    const { currentUserId, blockUserId } = req.body;

    if (!currentUserId || !blockUserId) {
      return res.status(400).json({ success: false, message: "Missing User IDs" });
    }

    // $addToSet prevents duplicate IDs in the array
    const updatedUser = await User.findByIdAndUpdate(
      currentUserId,
      { $addToSet: { blockedUsers: blockUserId } },
      { new: true } // Return the updated document to confirm
    );

    console.log("User Blocked List Now:", updatedUser.blockedUsers);

    res.status(200).json({ success: true, message: "User blocked successfully" });
  } catch (error) {
    console.error("Block Error:", error);
    res.status(500).json({ success: false, message: "Failed to block user" });
  }
});

router.delete("/delete-group/:groupId/:userId", async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    // Check if the user trying to delete is the actual creator
    if (group.creator.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Only the creator can delete this group" });
    }

    await Group.findByIdAndDelete(groupId);
    res.status(200).json({ success: true, message: "Group deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/:groupId/remove-user/:adminId/:targetUserId", async (req, res) => {
  try {
    const { groupId, adminId, targetUserId } = req.params;
    const group = await Group.findById(groupId);

    if (!group) return res.status(404).json({ success: false, message: "Group not found" });

    // 1. Verify the requester is the creator
    if (group.creator.toString() !== adminId) {
      return res.status(403).json({ success: false, message: "Only the leader can remove members" });
    }

    // 2. Prevent the leader from removing themselves via this button
    if (adminId === targetUserId) {
      return res.status(400).json({ success: false, message: "Leader cannot be removed this way" });
    }

    // 3. Remove the user from the members array
    group.members = group.members.filter(m => m.user.toString() !== targetUserId);
    group.memberCount = group.members.length;

    await group.save();
    res.status(200).json({ success: true, message: "User removed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// router.put("/update-group/:groupId/:userId", ...)
// router.put("/update-group/:groupId/:userId", ...)
router.put("/update-group/:groupId/:userId", upload.single("profilePicture"), async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { name, description, category } = req.body;

    console.log("Updating Group ID:", groupId);

    // 1. Find the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    // 2. Auth Check (Must be the creator)
    if (group.creator.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized: Only the creator can edit" });
    }

    // 3. Update Text Fields
    if (name) group.name = name;
    if (description) group.description = description;
    if (category) group.category = category;

    // 4. Handle Image Update (ImageKit Logic)
    if (req.file) {
      console.log("New image detected, uploading to ImageKit...");
      
      const uploadResult = await imagekit.upload({
        file: req.file.buffer,
        fileName: `group_update_${Date.now()}_${req.file.originalname}`,
        folder: "/groups",
      });

      // Update the URLs in the database
      group.profilePicture = uploadResult.url;
      group.profilePictureId = uploadResult.fileId;
    }

    // 5. Save the changes
    await group.save();

    res.status(200).json({
      success: true,
      message: "Group updated successfully",
      group: group
    });

  } catch (error) {
    console.error("Update Group Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;