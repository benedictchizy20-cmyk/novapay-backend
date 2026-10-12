"use strict";

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;

const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is missing from .env");
}

if (!supabaseSecretKey) {
    throw new Error(
        "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is missing from .env"
    );
}

const supabase = createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    }
);

console.log(
    "NOVAPAY KEY TYPE:",
    supabaseSecretKey.startsWith("sb_secret_")
        ? "NEW SECRET KEY"
        : supabaseSecretKey.startsWith("sb_publishable_")
            ? "PUBLISHABLE KEY"
            : supabaseSecretKey.startsWith("eyJ")
                ? "JWT-FORMAT KEY"
                : "UNKNOWN KEY FORMAT"
);

module.exports = supabase;