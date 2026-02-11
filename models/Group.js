const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, "Group name is required"], 
    trim: true,
    maxlength: [50, "Name cannot exceed 50 characters"]
  },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
comments: [{
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}],
  description: { 
    type: String, 
    default: "", 
    trim: true,
    maxlength: [250, "Description cannot exceed 250 characters"]
  },
  profilePicture: { 
    type: String, 
    default: "https://example.com/default-group-icon.png" 
  },
  profilePictureId: { type: String, default: "" },
  creator: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    notificationsEnabled: { type: Boolean, default: true } 
  }],
  
  memberCount: {
    type: Number,
    default: 1 
  },

  // ✅ PRICING FIELDS ADDED
  price: { 
    type: Number, 
    default: 0, // 0 means the group is free to join
    min: [0, "Price cannot be negative"] 
  },
  currency: { 
    type: String, 
    default: "USD",
    uppercase: true 
  },
  // Useful if you want to support subscriptions later
  paymentType: { 
    type: String, 
    enum: ['free', 'one-time', 'subscription'], 
    default: 'free' 
  },

  isPrivate: { type: Boolean, default: false },
  category: { type: String, default: "General" }

}, { timestamps: true });

// Updated index to include price filtering if needed
groupSchema.index({ name: 1, memberCount: -1 });
groupSchema.index({ category: 1, price: 1 });

module.exports = mongoose.model('Group', groupSchema);