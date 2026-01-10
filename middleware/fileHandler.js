const express = require("express");
const multer = require("multer");
const imagekit = require("./imagekit");
const fs = require("fs");
const router = express.Router();

// Use multer to handle incoming file temporarily in memory          
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const result = await imagekit.upload({
      file: req.file.buffer, // actual file bytes
      fileName: req.file.originalname, // original name
      folder: "/uploads" // optional folder on ImageKit
    });

    res.json({
      success: true,
      url: result.url, // ✅ image URL stored on ImageKit
      fileId: result.fileId
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
