// server/utils/upload.js
const multer =  require("multer");

// Use memory storage (keeps file in RAM, not disk)
const storage = multer.memoryStorage();

// Export multer instance for any route
const upload = multer({ storage });

module.exports = upload;
