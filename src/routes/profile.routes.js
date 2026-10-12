"use strict";

const express = require("express");
const multer = require("multer");

const {
    getProfile,
    updateProfile,
    uploadProfilePhoto
} = require("../controllers/profile.controller");

const {
    requireAuth
} = require("../middleware/auth.js");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, callback) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(
                new Error(
                    "Only JPG, PNG, and WebP images are allowed."
                )
            );
        }

        callback(null, true);
    }
});

// GET logged-in user's profile
router.get(
    "/",
    requireAuth,
    getProfile
);

// UPDATE name, email, and phone
router.put(
    "/",
    requireAuth,
    updateProfile
);

// UPLOAD profile picture
router.post(
    "/photo",
    requireAuth,
    upload.single("photo"),
    uploadProfilePhoto
);

module.exports = router;