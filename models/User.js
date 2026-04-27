const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  
  // --- OTP & VERIFICATION ---
  otp: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  isVerified: { type: Boolean, default: false },

  // --- PROFILE FIELDS ---
  profileImage: { type: String, default: "" },
  isPrivate: { type: Boolean, default: false },
  profileImageId: { type: String, default: "" },
  blockedUsers: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  phone: { type: String },
  bio: { type: String },
  interests: [{ type: String }],
  isProfileComplete: { type: Boolean, default: false },
  agreedToTerms: { type: Boolean, default: false },
  // Inside your userSchema in User.js
savedPosts: [{ 
  type: mongoose.Schema.Types.ObjectId, 
  ref: 'Group' // or 'Post' depending on your model name
}],
savedMoments: [{ 
  type: mongoose.Schema.Types.ObjectId, 
  ref: 'Moment' 
}],
followRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
followers: [{ 
  type: mongoose.Schema.Types.ObjectId, 
  ref: 'User' 
}],
following: [{ 
  type: mongoose.Schema.Types.ObjectId, 
  ref: 'User' 
}],

  // --- PUSH NOTIFICATIONS --- 
 expoPushToken: { 
  type: [String], 
  default: [] 
}
}, { timestamps: true });

// ✅ HELPER METHOD: Call this in your routes to check blocks easily
userSchema.methods.isBlocking = function(userId) {
  if (!this.blockedUsers) return false;
  return this.blockedUsers.some(id => id.toString() === userId.toString());
};

module.exports = mongoose.model('User', userSchema);