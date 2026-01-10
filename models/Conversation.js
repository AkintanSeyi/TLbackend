// Conversation.js
const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  participants: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  isGroupChat: { 
    type: Boolean, 
    default: false 
  },
  groupName: { 
    type: String, 
    trim: true 
  },
  lastMessage: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message' 
  },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', ConversationSchema);