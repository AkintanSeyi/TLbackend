const express = require("express");
const router = express.Router();
const User = require("../models/User");
//const user  = require("../models/User")
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const upload = require("./../middleware/upload");
const imagekit = require("../middleware/imagekit");
const { sendEmail } = require("../middleware/sendemail"); 



// Replace with env variable in real apps
const JWT_SECRET = "Y4v@tq9!uLz$B8wXp7*MnJ2#KpVc8HdQ";

const resetCodes = {};

function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}




router.post("/signup", async (req, res) => {
  let { name, email, password, confirmpassword } = req.body;
  console.log("Hiiii");

  try {
    // 1. Check if passwords match
    if (password !== confirmpassword) {
      return res
        .status(400)
        .json({ error: "Passwords do not match." });
    }

    // 2. Check password length
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters long." });
    }

    // Convert email to lowercase
    email = email.toLowerCase();

    // 3. Hash the password
    const hashedpassword = await bcrypt.hash(password, 10);

    // 4. Save user
    const user = await User.create({ 
      name, 
      email, 
      password: hashedpassword 
    });

    // 5. Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        name: user.name,
        profileimage: user.profileImage,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 6. Return response with token and user data
    res.status(201).json({ 
      success: true,
      message: "User created", 
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isProfileComplete: user.isProfileComplete || false,
      }
    });

  } catch (err) {
    // Check if it's a MongoDB duplicate key error (code 11000)
    if (err.code === 11000) {
      return res.status(400).json({ error: "email already exists." });
    }
    console.error("Signup Error:", err);
    res.status(400).json({ error: "Invalid data provided." });
  }
});





// Login
router.post("/login", async (req, res) => {
  let { email, password } = req.body;

  try {
    email = email.toLowerCase(); // make email lowercase

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Incorrect password" });

    // If user is not verified
    if (!user.isProfileComplete) {
      return res.json({
        error: "User not verified",
        userNotVerified: true,
       
        email: user.email,
      });
    }

    // Normal verified login
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        profileimage: user.profileImage,
        name: user.name,

      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ message: "Login successful", token });
  } catch (err) {
 
    res.status(500).json({ error: "Login failed" });
  }
});


router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res
      .status(400)
      .json({ success: false, message: "email and code are required" });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check OTP 
    console.log(user.otp , otp)
    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // Check expiration
    if (user.otpExpiresAt && user.otpExpiresAt < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // Mark user as verified
 user.isProfileComplete = true; 
user.otp = null;
user.otpExpiresAt = null;
await user.save();

    

  

    // Generate JWT token (enforcing typeofuser and riderverified like other flows)
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        name: user.name,
         profileimage: user.profileImage,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
  success: true,
  message: "User verified successfully",
  token,
  user: {
    id: user._id,
    email: user.email,
    name: user.name,
    isProfileComplete: user.isProfileComplete, // Changed from ProfileComplete
  },
});
  } catch (error) {
    console.error("Error in verify-otp:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "email is required" });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const otp = generateResetCode(); // e.g., 6-digit code
    const otpExpiresAt = Date.now() + 5 * 60 * 1000; // 5 min
    console.log(otp)

    user.otp = otp;
    console.log(user.otp)
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    // ✅ NEW: Trigger the SendGrid Email
    await sendEmail(
      user.email, 
      "Your Verification Code", 
      "Hello! Use the code below to verify your account.", 
      otp
    );

    res.json({
      success: true,
      message: "OTP sent successfully to your email",
      expiresAt: otpExpiresAt,
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Generate Reset Code
router.post("/generate-reset", async (req, res) => {
  console.log("Hiiiiiii")
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });

  try {
    const user = await User.findOne({ email: email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const code = generateResetCode();
    resetCodes[email] = {
      code,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
    };
    console.log(code)

    // ✅ Send password reset code using Amazon SES
   

    res.json({ message: "Reset code sent successfully" });
  } catch (err) {
    console.error("Error generating reset code:", err);
    res.status(500).json({ error: "Failed to send reset code" });
  }
});

// Verify Reset Code

router.post("/verify-reset", async (req, res) => {
  try {
    const { email, code } = req.body;

    const record = resetCodes[email];
  
    
    if (!record) {
      return res.status(400).json({ error: "No reset code found for this email" });
    }

    if (record.code !== code) {
      return res.status(400).json({ error: "Invalid code" });
    }

    if (Date.now() > record.expires) {
      delete resetCodes[email];
      return res.status(400).json({ error: "Code has expired" });
    }

    // ✅ Code is correct — generate temporary reset token (15 min)
   // const resetToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: "15m" });

   

    res.json({
      success: true,
      message: "Code verified successfully. Use reset token to set a new password.",
    });
  } catch (err) {
 
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// Reset password
router.post("/reset-password", async (req, res) => {
  const { email, code, newpassword } = req.body;

  const record = resetCodes[email];

  
  if (!record) {
    return res.status(400).json({ error: "No reset code found for this email" });
  }

  if (record.code !== code) {
    return res.status(400).json({ error: "Invalid code" });
  }
 


  try {
    const hashedpassword = await bcrypt.hash(newpassword, 10);
    await User.findOneAndUpdate( { email: email }, { password: hashedpassword });
   
    delete resetCodes[email];
    res.json({ message: "password reset successful" });
  } catch (err) {
  
    res.status(500).json({ error: "Failed to reset password" });
  }
});




router.patch("/complete-profile", upload.single("profileImage"), async (req, res) => {
  try {
    // We expect the email or userId in the body to identify the user
    let { email, phone, bio, interests, isAgreed } = req.body;

    if (!email) {
      return res.status(400).json({ message: "email is required to identify user" });
    }

    let updateData = {
      phone,
      bio,
      interests: typeof interests === 'string' ? JSON.parse(interests) : interests,
      agreedToTerms: isAgreed === 'true' || isAgreed === true,
      isProfileComplete: true,
    };

    // ✅ Handle ImageKit Upload if a file exists
    if (req.file) {
      const uploadResult = await imagekit.upload({
        file: req.file.buffer,
        fileName: `profile_${Date.now()}_${req.file.originalname}`,
        folder: "/user_profiles",
      });

      updateData.profileImage = uploadResult.url;
      updateData.profileImageId = uploadResult.fileId;
    }

    // ✅ Update User record
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: updateData },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile completed successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        interests: user.interests,
        isProfileComplete: user.isProfileComplete
      }
    });

  } catch (error) {
    console.error("Complete Profile Error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});


router.get("/user-profile/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    console.log(user)
    if (!user) return res.status(404).json({ message: "User not found" });
    
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// router.patch("/complete-profile", upload.single("profileImage"), ...
router.patch("/edit-profile", upload.single("profileImage"), async (req, res) => {
  try {
    // 1. Get data from req.body (parsed by multer)
    let { email, name, phone, bio, interests } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required to update profile" });
    }

    // 2. Prepare the update object
    let updateData = {
      name,
      phone,
      bio,
      // Parse interests if it comes as a JSON string from the frontend
      interests: typeof interests === 'string' ? JSON.parse(interests) : interests,
      isProfileComplete: true,
    };

    // 3. If a new image was uploaded via the Edit screen
    if (req.file) {
      const uploadResult = await imagekit.upload({
        file: req.file.buffer,
        fileName: `profile_${Date.now()}_${req.file.originalname}`,
        folder: "/user_profiles",
      });

      updateData.profileImage = uploadResult.url;
      updateData.profileImageId = uploadResult.fileId;
    }

    // 4. Update the user in MongoDB
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: updateData },
      { new: true } // Returns the updated document
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log("Updated User:", user.name);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        interests: user.interests,
        phone: user.phone,
        bio: user.bio
      }
    });

  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

router.post("/change-password", async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    // 1. Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Verify Current Password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // 3. Hash the New Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 4. Update and Save
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/delete-account", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // 1. Find and Delete User
    const user = await User.findOneAndDelete({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Optional: Delete other user-related data (Posts, Comments, etc.)
    // await Post.deleteMany({ creator: user._id });

    res.status(200).json({ 
      success: true, 
      message: "Account and associated data deleted successfully" 
    });
  } catch (error) {
    console.error("Delete Account Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});



module.exports = router;