const mongoose = require('mongoose');

const momentSchema = new mongoose.Schema({
  // --- OWNERSHIP ---
  author: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  // Ties back to your Group model if the moment is shared within a community
  associatedGroup: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Group', 
    default: null 
  },

  // --- CONTENT --- 
  caption: { 
    type: String, 
    trim: true, 
    maxlength: [2200, "Caption is too long"] 
  },
  mediaUrl: { 
    type: String, 
    required: [true, "Media URL is required"] 
  },
  mediaId: { 
    type: String, 
    required: true // For management in your storage bucket (Cloudinary/S3)
  },

  // --- INTERACTION ---
  likes: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],

  // --- SETTINGS ---
  isArchived: { 
    type: Boolean, 
    default: false 
  },
  feeling: {
    name: { type: String, default: "" }, // e.g., "Happy"
    emoji: { type: String, default: "" }  // e.g., "😊"
  },
  tags: [{ 
    type: String 
  }]
}, { timestamps: true });

// Optimized for fetching a user's feed or a group's timeline
momentSchema.index({ author: 1, createdAt: -1 });
momentSchema.index({ associatedGroup: 1, createdAt: -1 });

// Helper to quickly check if a specific user liked this moment
momentSchema.methods.isLikedBy = function(userId) {
  return this.likes.some(id => id.toString() === userId.toString());
};

module.exports = mongoose.model('Moment', momentSchema);