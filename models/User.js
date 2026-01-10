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

  // --- PUSH NOTIFICATIONS ---
  expoPushToken: { type: String, default: null }
}, { timestamps: true });

// ✅ HELPER METHOD: Call this in your routes to check blocks easily
userSchema.methods.isBlocking = function(userId) {
  if (!this.blockedUsers) return false;
  return this.blockedUsers.some(id => id.toString() === userId.toString());
};

module.exports = mongoose.model('User', userSchema);