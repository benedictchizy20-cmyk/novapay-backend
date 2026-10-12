"use strict";

const supabase =
    require("../config/supabase");


/* =========================================================
   HELPERS
========================================================= */

function cleanAccountNumber(phone) {

    const digits =
        String(phone || "")
            .replace(/\D/g, "");

    if (!digits) {
        return "";
    }

    // Nigerian international format:
    // 2348012345678 -> 8012345678
    if (
        digits.startsWith("234") &&
        digits.length === 13
    ) {
        return digits.substring(3);
    }

    // Nigerian local format:
    // 08012345678 -> 8012345678
    if (
        digits.startsWith("0")
    ) {
        return digits.substring(1);
    }

    return digits;
}


/* =========================================================
   REGISTER
========================================================= */

async function register(req, res) {

    try {

        const {
            full_name,
            email,
            password,
            phone,
            profile_photo
        } = req.body;


        /* =====================================================
           VALIDATION
        ===================================================== */

        if (
            !full_name ||
            !email ||
            !password ||
            !phone
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Full name, email, password and phone are required."

            });

        }


        if (
            String(password).length < 8
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Password must contain at least 8 characters."

            });

        }


        const cleanName =
            String(full_name).trim();


        const cleanEmail =
            String(email)
                .trim()
                .toLowerCase();


        const cleanPhone =
            String(phone).trim();


        const accountNumber =
            cleanAccountNumber(
                cleanPhone
            );


        if (!accountNumber) {

            return res.status(400).json({

                success: false,

                message:
                    "A valid phone number is required."

            });

        }


        /* =====================================================
           CHECK ACCOUNT NUMBER
        ===================================================== */

        const {
            data: existingAccount,
            error: accountCheckError
        } =
            await supabase
                .from("profiles")
                .select("id")
                .eq(
                    "account_number",
                    accountNumber
                )
                .maybeSingle();


        if (accountCheckError) {

            console.error(
                "NOVAPAY ACCOUNT CHECK ERROR:",
                accountCheckError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to check account number."

            });

        }


        if (existingAccount) {

            return res.status(409).json({

                success: false,

                message:
                    "A NovaPay account already exists for this phone number."

            });

        }


        /* =====================================================
           CHECK EMAIL
        ===================================================== */

        const {
            data: existingProfile,
            error: emailCheckError
        } =
            await supabase
                .from("profiles")
                .select("id")
                .eq(
                    "email",
                    cleanEmail
                )
                .maybeSingle();


        if (emailCheckError) {

            console.error(
                "NOVAPAY EMAIL CHECK ERROR:",
                emailCheckError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to check email address."

            });

        }


        if (existingProfile) {

            return res.status(409).json({

                success: false,

                message:
                    "A NovaPay account already exists for this email address."

            });

        }


        /* =====================================================
           CREATE SUPABASE AUTH USER
        ===================================================== */

        const {
            data: authData,
            error: authError
        } =
            await supabase.auth.admin.createUser({

                email:
                    cleanEmail,

                password:
                    password,

                email_confirm:
                    true,

                user_metadata: {

                    full_name:
                        cleanName,

                    phone:
                        cleanPhone

                }

            });


        if (authError) {

            console.error(
                "NOVAPAY AUTH REGISTER ERROR:",
                authError
            );

            return res.status(400).json({

                success: false,

                message:
                    authError.message

            });

        }


        const userId =
            authData.user.id;


        /* =====================================================
           CREATE PROFILE
        ===================================================== */

        const {
            data: profile,
            error: profileError
        } =
            await supabase
                .from("profiles")
                .insert({

                    id:
                        userId,

                    full_name:
                        cleanName,

                    email:
                        cleanEmail,

                    phone:
                        cleanPhone,

                    account_number:
                        accountNumber,

                    role:
                        "user",

                    profile_photo:
                        profile_photo || null

                })
                .select()
                .single();


        if (profileError) {

            console.error(
                "NOVAPAY PROFILE REGISTER ERROR:",
                profileError
            );


            // Roll back Auth user
            await supabase.auth.admin.deleteUser(
                userId
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to create NovaPay profile."

            });

        }


        /* =====================================================
           CREATE FINANCIAL ACCOUNT
           
           IMPORTANT:
           NovaPay uses $ as the account currency.
        ===================================================== */

        const {
            data: account,
            error: accountError
        } =
            await supabase
                .from("accounts")
                .insert({

                    user_id:
                        userId,

                    currency:
                        "$",

                    balance:
                        0,

                    status:
                        "active"

                })
                .select()
                .single();


        if (accountError) {

            console.error(
                "NOVAPAY ACCOUNT REGISTER ERROR:",
                accountError
            );


            // Remove profile
            await supabase
                .from("profiles")
                .delete()
                .eq(
                    "id",
                    userId
                );


            // Remove Auth user
            await supabase.auth.admin.deleteUser(
                userId
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to create financial account."

            });

        }


        /* =====================================================
           AUTOMATIC LOGIN AFTER REGISTRATION
        ===================================================== */

        const {
            data: sessionData,
            error: sessionError
        } =
            await supabase.auth.signInWithPassword({

                email:
                    cleanEmail,

                password:
                    password

            });


        /* =====================================================
           IF AUTOMATIC LOGIN FAILS
        ===================================================== */

        if (sessionError) {

            console.error(
                "NOVAPAY REGISTER SESSION ERROR:",
                sessionError
            );


            return res.status(201).json({

                success:
                    true,

                message:
                    "Account created successfully. Please log in.",

                user: {

                    id:
                        profile.id,

                    full_name:
                        profile.full_name,

                    email:
                        profile.email,

                    phone:
                        profile.phone,

                    account_number:
                        profile.account_number,

                    role:
                        profile.role,

                    profile_photo:
                        profile.profile_photo,

                    balance:
                        Number(
                            account.balance || 0
                        ),

                    currency:
                        account.currency || "$",

                    account_status:
                        account.status || "active"

                }

            });

        }


        /* =====================================================
           SUCCESSFUL REGISTRATION + SESSION
        ===================================================== */

        return res.status(201).json({

            success:
                true,

            message:
                "NovaPay account created successfully.",

            access_token:
                sessionData.session.access_token,

            refresh_token:
                sessionData.session.refresh_token,

            user: {

                id:
                    profile.id,

                full_name:
                    profile.full_name,

                email:
                    profile.email,

                phone:
                    profile.phone,

                account_number:
                    profile.account_number,

                role:
                    profile.role,

                profile_photo:
                    profile.profile_photo,

                balance:
                    Number(
                        account.balance || 0
                    ),

                currency:
                    account.currency || "$",

                account_status:
                    account.status || "active"

            }

        });

    } catch (error) {

        console.error(
            "NOVAPAY REGISTER ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to create NovaPay account."

        });

    }

}


/* =========================================================
   LOGIN
========================================================= */

async function login(req, res) {

    try {

        const {
            email,
            password
        } = req.body;


        /* =====================================================
           VALIDATION
        ===================================================== */

        if (
            !email ||
            !password
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Email and password are required."

            });

        }


        const cleanEmail =
            String(email)
                .trim()
                .toLowerCase();


        /* =====================================================
           SUPABASE LOGIN
        ===================================================== */

        const {
            data,
            error
        } =
            await supabase.auth.signInWithPassword({

                email:
                    cleanEmail,

                password:
                    password

            });


        if (error) {

            console.error(
                "NOVAPAY LOGIN AUTH ERROR:",
                error
            );

            return res.status(401).json({

                success: false,

                message:
                    "Invalid email or password."

            });

        }


        const user =
            data.user;


        /* =====================================================
           LOAD PROFILE
        ===================================================== */

        const {
            data: profile,
            error: profileError
        } =
            await supabase
                .from("profiles")
                .select(
                    `
                    id,
                    full_name,
                    email,
                    phone,
                    account_number,
                    role,
                    profile_photo
                    `
                )
                .eq(
                    "id",
                    user.id
                )
                .single();


        if (profileError) {

            console.error(
                "NOVAPAY LOGIN PROFILE ERROR:",
                profileError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load NovaPay profile."

            });

        }


        /* =====================================================
           LOAD FINANCIAL ACCOUNT
        ===================================================== */

        const {
            data: account,
            error: accountError
        } =
            await supabase
                .from("accounts")
                .select(
                    `
                    id,
                    balance,
                    currency,
                    status
                    `
                )
                .eq(
                    "user_id",
                    user.id
                )
                .single();


        if (accountError) {

            console.error(
                "NOVAPAY LOGIN ACCOUNT ERROR:",
                accountError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load NovaPay account."

            });

        }


        /* =====================================================
           SUCCESS
        ===================================================== */

        return res.json({

            success:
                true,

            message:
                "Login successful.",

            access_token:
                data.session.access_token,

            refresh_token:
                data.session.refresh_token,

            user: {

                id:
                    profile.id,

                full_name:
                    profile.full_name,

                email:
                    profile.email,

                phone:
                    profile.phone,

                account_number:
                    profile.account_number,

                role:
                    profile.role,

                profile_photo:
                    profile.profile_photo,

                balance:
                    Number(
                        account.balance || 0
                    ),

                currency:
                    account.currency || "$",

                account_status:
                    account.status || "active"

            }

        });

    } catch (error) {

        console.error(
            "NOVAPAY LOGIN ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to log in."

        });

    }

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

    register,

    login

};