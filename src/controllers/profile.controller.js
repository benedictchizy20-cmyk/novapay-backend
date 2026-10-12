"use strict";

const supabase = require("../config/supabase");
const crypto = require("crypto");

const BUCKET = "novapay-profile-photos";

function publicProfile(profile) {
    return {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        account_number: profile.account_number,
        role: profile.role,
        profile_photo: profile.profile_photo
    };
}

   
async function getProfile(req, res) {
    try {
        // Get the user's profile.
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select(
                "id, full_name, email, phone, account_number, role, profile_photo"
            )
            .eq("id", req.user.id)
            .single();

        if (profileError || !profile) {
            console.error("NOVAPAY GET PROFILE ERROR:", profileError);

            return res.status(404).json({
                success: false,
                message: "Profile not found."
            });
        }

        // Get the latest financial account data from Supabase.
        const { data: account, error: accountError } = await supabase
            .from("accounts")
            .select("balance, currency, status")
            .eq("user_id", req.user.id)
            .maybeSingle();

        if (accountError) {
            console.error("NOVAPAY GET ACCOUNT ERROR:", accountError);

            return res.status(500).json({
                success: false,
                message: "Unable to load your account balance."
            });
        }

        if (!account) {
            return res.status(404).json({
                success: false,
                message: "Financial account not found."
            });
        }

        // Combine profile details with the latest account values.
        const user = {
            ...publicProfile(profile),
            balance: Number(account.balance || 0),
            currency: account.currency || "USD",
            account_status: account.status || "active"
        };

        return res.json({
            success: true,
            user
        });

    } catch (error) {
        console.error("NOVAPAY GET PROFILE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load your profile."
        });
    }
}


async function updateProfile(req, res) {
    try {
        const fullName = String(req.body.full_name || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const phone = String(req.body.phone || "").trim();

        if (!fullName || !email || !phone) {
            return res.status(400).json({
                success: false,
                message: "Full name, email, and phone are required."
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address."
            });
        }

        const { data: existing, error: readError } = await supabase
            .from("profiles")
            .select("id, email")
            .eq("id", req.user.id)
            .single();

        if (readError || !existing) {
            return res.status(404).json({
                success: false,
                message: "Profile not found."
            });
        }

        if (email !== String(existing.email || "").toLowerCase()) {
            const { error: authUpdateError } =
                await supabase.auth.admin.updateUserById(req.user.id, {
                    email
                });

            if (authUpdateError) {
                return res.status(400).json({
                    success: false,
                    message: authUpdateError.message ||
                        "Unable to update your email address."
                });
            }
        }

        const { data: profile, error: updateError } = await supabase
            .from("profiles")
            .update({
                full_name: fullName,
                email,
                phone
            })
            .eq("id", req.user.id)
            .select(
                "id, full_name, email, phone, account_number, role, profile_photo"
            )
            .single();

        if (updateError || !profile) {
            console.error("NOVAPAY UPDATE PROFILE ERROR:", updateError);

            return res.status(500).json({
                success: false,
                message: "Unable to save profile changes."
            });
        }

        return res.json({
            success: true,
            message: "Profile updated successfully.",
            user: publicProfile(profile)
        });
    } catch (error) {
        console.error("NOVAPAY UPDATE PROFILE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update your profile."
        });
    }
}

async function uploadProfilePhoto(req, res) {
    let uploadedPath = null;

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Choose an image to upload."
            });
        }

        const allowedTypes = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp"
        };

        const extension = allowedTypes[req.file.mimetype];

        if (!extension) {
            return res.status(400).json({
                success: false,
                message: "Only JPG, PNG, and WebP images are allowed."
            });
        }

        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                message: "The image must be 5 MB or smaller."
            });
        }

        const filename =
            `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;

        uploadedPath = `${req.user.id}/${filename}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(uploadedPath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false,
                cacheControl: "3600"
            });

        if (uploadError) {
            console.error("NOVAPAY PHOTO UPLOAD ERROR:", uploadError);

            return res.status(500).json({
                success: false,
                message: "Unable to upload your photo. Check the Storage bucket setup."
            });
        }

        const { data: publicData } = supabase.storage
            .from(BUCKET)
            .getPublicUrl(uploadedPath);

        const photoUrl = publicData.publicUrl;

        const { data: profile, error: updateError } = await supabase
            .from("profiles")
            .update({
                profile_photo: photoUrl
            })
            .eq("id", req.user.id)
            .select(
                "id, full_name, email, phone, account_number, role, profile_photo"
            )
            .single();

        if (updateError || !profile) {
            console.error("NOVAPAY SAVE PHOTO URL ERROR:", updateError);

            await supabase.storage
                .from(BUCKET)
                .remove([uploadedPath]);

            return res.status(500).json({
                success: false,
                message: "Photo uploaded, but the profile could not be updated."
            });
        }

        return res.json({
            success: true,
            message: "Profile picture updated successfully.",
            user: publicProfile(profile)
        });
    } catch (error) {
        console.error("NOVAPAY PHOTO UPLOAD ERROR:", error);

        if (uploadedPath) {
            await supabase.storage
                .from(BUCKET)
                .remove([uploadedPath])
                .catch(() => {});
        }

        return res.status(500).json({
            success: false,
            message: "Unable to upload your profile picture."
        });
    }
}

module.exports = {
    getProfile,
    updateProfile,
    uploadProfilePhoto
};