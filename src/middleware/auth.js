"use strict";

const supabase = require("../config/supabase");

async function requireAuth(req, res, next) {

    try {

        const authHeader =
            req.headers.authorization || "";

        if (
            !authHeader.startsWith("Bearer ")
        ) {

            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });

        }

        const token =
            authHeader.substring(7).trim();

        if (!token) {

            return res.status(401).json({
                success: false,
                message: "Authentication token is missing."
            });

        }

        const {
            data,
            error
        } = await supabase.auth.getUser(token);

        if (
            error ||
            !data ||
            !data.user
        ) {

            return res.status(401).json({
                success: false,
                message: "Invalid or expired authentication token."
            });

        }

        req.user = data.user;

        next();

    } catch (error) {

        console.error(
            "NOVAPAY AUTH MIDDLEWARE ERROR:",
            error
        );

        return res.status(401).json({
            success: false,
            message: "Authentication failed."
        });
    }
}


async function requireAdmin(
    req,
    res,
    next
) {

    try {

        if (!req.user) {

            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });

        }

        const {
            data: profile,
            error
        } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", req.user.id)
            .maybeSingle();

        if (error) {

            console.error(
                "NOVAPAY ADMIN PROFILE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify administrator."
            });
        }

        if (
            !profile ||
            ![
                "admin",
                "super_admin"
            ].includes(profile.role)
        ) {

            return res.status(403).json({
                success: false,
                message: "Administrator access required."
            });

        }

        req.profile = profile;

        next();

    } catch (error) {

        console.error(
            "NOVAPAY ADMIN MIDDLEWARE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to verify administrator."
        });
    }
}


module.exports = {
    requireAuth,
    requireAdmin
};