"use strict";

const supabase = require("../config/supabase");

const LARGE_DEPOSIT_LIMIT = 50000;


/* =========================================================
   CREATE DEPOSIT
========================================================= */

async function createDeposit(req, res) {
    try {
        const userId = req.user.id;

        const {
            amount,
            deposit_method,
            description
        } = req.body;

        const numericAmount = Number(amount);

        /* -------------------------------------------------
           VALIDATE AMOUNT
        ------------------------------------------------- */

        if (
            !Number.isFinite(numericAmount) ||
            numericAmount <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid deposit amount."
            });
        }


        /* -------------------------------------------------
           VALIDATE METHOD
        ------------------------------------------------- */

        if (!deposit_method) {
            return res.status(400).json({
                success: false,
                message: "Deposit method is required."
            });
        }


        /* -------------------------------------------------
           GET USER ACCOUNT
        ------------------------------------------------- */

        const { data: account, error: accountError } =
            await supabase
                .from("accounts")
                .select(`
                    id,
                    user_id,
                    balance,
                    currency,
                    status
                `)
                .eq("user_id", userId)
                .single();

        if (accountError || !account) {
            console.error(
                "NOVAPAY DEPOSIT ACCOUNT ERROR:",
                accountError
            );

            return res.status(404).json({
                success: false,
                message: "User account could not be found."
            });
        }


        /* -------------------------------------------------
           CHECK ACCOUNT STATUS
        ------------------------------------------------- */

        if (account.status !== "active") {
            return res.status(403).json({
                success: false,
                message:
                    "Your account is temporarily unavailable while we complete a required verification. Please contact your bank or NovaPay support for assistance."
            });
        }


        /* -------------------------------------------------
           GENERATE DEPOSIT REFERENCE
        ------------------------------------------------- */

        const depositReference =
            `DEP-${Date.now()}-${Math.floor(
                1000 + Math.random() * 9000
            )}`;


        /* -------------------------------------------------
           LARGE DEPOSIT RULE
           
           IMPORTANT:
           > $50,000 requires approval.
        ------------------------------------------------- */

        const requiresApproval =
            numericAmount > LARGE_DEPOSIT_LIMIT;


        /* -------------------------------------------------
           LARGE DEPOSIT
           
           DO NOT CREDIT BALANCE YET.
           RESTRICT ACCOUNT.
        ------------------------------------------------- */

        if (requiresApproval) {

            const { error: depositError } =
                await supabase
                    .from("deposits")
                    .insert({
                        deposit_reference: depositReference,
                        user_id: userId,
                        account_id: account.id,
                        amount: numericAmount,
                        currency: "$",
                        deposit_method:
                            String(deposit_method).trim(),
                        status: "pending",
                        description:
                            description
                                ? String(description).trim()
                                : null
                    });

            if (depositError) {
                console.error(
                    "NOVAPAY LARGE DEPOSIT ERROR:",
                    depositError
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to create deposit."
                });
            }


            /* ---------------------------------------------
               RESTRICT ACCOUNT
            --------------------------------------------- */

            const { error: restrictionError } =
                await supabase
                    .from("accounts")
                    .update({
                        status: "restricted",
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", account.id);

            if (restrictionError) {
                console.error(
                    "NOVAPAY ACCOUNT RESTRICTION ERROR:",
                    restrictionError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Deposit was created, but account restriction could not be completed."
                });
            }


            return res.status(201).json({
                success: true,
                requires_approval: true,
                message:
                    "Your deposit is pending required verification. Please contact your bank or NovaPay support for assistance.",
                deposit: {
                    deposit_reference: depositReference,
                    amount: numericAmount,
                    currency: "$",
                    status: "pending"
                }
            });
        }


        /* -------------------------------------------------
           NORMAL DEPOSIT
           
           UNDER OR EQUAL TO $50,000
        ------------------------------------------------- */

        const newBalance =
            Number(account.balance) + numericAmount;


        /* -------------------------------------------------
           UPDATE BALANCE
        ------------------------------------------------- */

        const { error: balanceError } =
            await supabase
                .from("accounts")
                .update({
                    balance: newBalance,
                    updated_at: new Date().toISOString()
                })
                .eq("id", account.id);

        if (balanceError) {
            console.error(
                "NOVAPAY DEPOSIT BALANCE ERROR:",
                balanceError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to update account balance."
            });
        }


        /* -------------------------------------------------
           CREATE COMPLETED DEPOSIT
        ------------------------------------------------- */

        const { data: deposit, error: depositError } =
            await supabase
                .from("deposits")
                .insert({
                    deposit_reference: depositReference,
                    user_id: userId,
                    account_id: account.id,
                    amount: numericAmount,
                    currency: "$",
                    deposit_method:
                        String(deposit_method).trim(),
                    status: "completed",
                    description:
                        description
                            ? String(description).trim()
                            : null
                })
                .select()
                .single();

        if (depositError) {
            console.error(
                "NOVAPAY COMPLETED DEPOSIT ERROR:",
                depositError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Deposit was processed but history could not be saved."
            });
        }


        return res.status(201).json({
            success: true,
            requires_approval: false,
            message: "Deposit completed successfully.",
            deposit,
            new_balance: newBalance
        });

    } catch (error) {

        console.error(
            "NOVAPAY CREATE DEPOSIT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to process deposit."
        });
    }
}


/* =========================================================
   GET USER DEPOSIT HISTORY
========================================================= */

async function getDepositHistory(req, res) {
    try {

        const userId = req.user.id;

        const { data, error } =
            await supabase
                .from("deposits")
                .select(`
                    id,
                    deposit_reference,
                    amount,
                    currency,
                    deposit_method,
                    status,
                    description,
                    created_at,
                    approved_at,
                    rejected_at,
                    rejection_reason
                `)
                .eq("user_id", userId)
                .order("created_at", {
                    ascending: false
                });

        if (error) {
            console.error(
                "NOVAPAY DEPOSIT HISTORY ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load deposit history."
            });
        }

        return res.json({
            success: true,
            deposits: data || []
        });

    } catch (error) {

        console.error(
            "NOVAPAY DEPOSIT HISTORY SERVER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load deposit history."
        });
    }
}


/* =========================================================
   ADMIN — GET PENDING DEPOSITS
========================================================= */

async function getPendingDeposits(req, res) {
    try {

        const { data, error } =
            await supabase
                .from("deposits")
                .select(`
                    id,
                    deposit_reference,
                    user_id,
                    account_id,
                    amount,
                    currency,
                    deposit_method,
                    status,
                    description,
                    created_at,
                    profiles!deposits_user_id_fkey (
                        full_name,
                        email,
                        account_number
                    )
                `)
                .eq("status", "pending")
                .order("created_at", {
                    ascending: true
                });

        if (error) {
            console.error(
                "NOVAPAY PENDING DEPOSITS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load pending deposits."
            });
        }

        return res.json({
            success: true,
            deposits: data || []
        });

    } catch (error) {

        console.error(
            "NOVAPAY PENDING DEPOSITS SERVER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load pending deposits."
        });
    }
}


/* =========================================================
   ADMIN — APPROVE DEPOSIT
========================================================= */

async function approveDeposit(req, res) {
    try {

        const adminId = req.user.id;

        const {
            deposit_id
        } = req.body;

        if (!deposit_id) {
            return res.status(400).json({
                success: false,
                message: "Deposit ID is required."
            });
        }


        /* -------------------------------------------------
           GET PENDING DEPOSIT
        ------------------------------------------------- */

        const { data: deposit, error: depositError } =
            await supabase
                .from("deposits")
                .select(`
                    id,
                    user_id,
                    account_id,
                    amount,
                    status
                `)
                .eq("id", deposit_id)
                .single();

        if (depositError || !deposit) {
            return res.status(404).json({
                success: false,
                message: "Deposit could not be found."
            });
        }


        if (deposit.status !== "pending") {
            return res.status(400).json({
                success: false,
                message:
                    `This deposit has already been ${deposit.status}.`
            });
        }


        /* -------------------------------------------------
           GET ACCOUNT
        ------------------------------------------------- */

        const { data: account, error: accountError } =
            await supabase
                .from("accounts")
                .select(`
                    id,
                    user_id,
                    balance,
                    status
                `)
                .eq("id", deposit.account_id)
                .single();

        if (accountError || !account) {
            return res.status(404).json({
                success: false,
                message:
                    "The user's account could not be found."
            });
        }


        /* -------------------------------------------------
           CREDIT BALANCE
        ------------------------------------------------- */

        const newBalance =
            Number(account.balance) +
            Number(deposit.amount);


        const { error: balanceError } =
            await supabase
                .from("accounts")
                .update({
                    balance: newBalance,
                    status: "active",
                    updated_at:
                        new Date().toISOString()
                })
                .eq("id", account.id);

        if (balanceError) {
            console.error(
                "NOVAPAY APPROVE DEPOSIT BALANCE ERROR:",
                balanceError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to update the user's balance."
            });
        }


        /* -------------------------------------------------
           APPROVE DEPOSIT
        ------------------------------------------------- */

        const { data: approvedDeposit, error: approvalError } =
            await supabase
                .from("deposits")
                .update({
                    status: "approved",
                    approved_at:
                        new Date().toISOString(),
                    approved_by: adminId
                })
                .eq("id", deposit.id)
                .eq("status", "pending")
                .select()
                .single();

        if (approvalError || !approvedDeposit) {

            console.error(
                "NOVAPAY APPROVE DEPOSIT ERROR:",
                approvalError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Deposit approval could not be completed."
            });
        }


        return res.json({
            success: true,
            message:
                "Deposit approved successfully.",
            deposit: approvedDeposit,
            new_balance: newBalance
        });

    } catch (error) {

        console.error(
            "NOVAPAY APPROVE DEPOSIT SERVER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to approve deposit."
        });
    }
}


/* =========================================================
   ADMIN — REJECT DEPOSIT
========================================================= */

async function rejectDeposit(req, res) {
    try {

        const adminId = req.user.id;

        const {
            deposit_id,
            reason
        } = req.body;

        if (!deposit_id) {
            return res.status(400).json({
                success: false,
                message: "Deposit ID is required."
            });
        }


        /* -------------------------------------------------
           GET DEPOSIT
        ------------------------------------------------- */

        const { data: deposit, error: depositError } =
            await supabase
                .from("deposits")
                .select(`
                    id,
                    account_id,
                    status
                `)
                .eq("id", deposit_id)
                .single();

        if (depositError || !deposit) {
            return res.status(404).json({
                success: false,
                message: "Deposit could not be found."
            });
        }


        if (deposit.status !== "pending") {
            return res.status(400).json({
                success: false,
                message:
                    `This deposit has already been ${deposit.status}.`
            });
        }


        /* -------------------------------------------------
           REJECT DEPOSIT
        ------------------------------------------------- */

        const { data: rejectedDeposit, error: rejectionError } =
            await supabase
                .from("deposits")
                .update({
                    status: "rejected",
                    rejected_at:
                        new Date().toISOString(),
                    rejected_by: adminId,
                    rejection_reason:
                        reason
                            ? String(reason).trim()
                            : "Deposit rejected by admin"
                })
                .eq("id", deposit.id)
                .eq("status", "pending")
                .select()
                .single();

        if (rejectionError || !rejectedDeposit) {

            console.error(
                "NOVAPAY REJECT DEPOSIT ERROR:",
                rejectionError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Deposit rejection could not be completed."
            });
        }


        /* -------------------------------------------------
           RESTORE ACCOUNT
        ------------------------------------------------- */

        const { error: accountError } =
            await supabase
                .from("accounts")
                .update({
                    status: "active",
                    updated_at:
                        new Date().toISOString()
                })
                .eq("id", deposit.account_id);

        if (accountError) {

            console.error(
                "NOVAPAY RESTORE ACCOUNT ERROR:",
                accountError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Deposit was rejected but account status could not be restored."
            });
        }


        return res.json({
            success: true,
            message:
                "Deposit rejected successfully.",
            deposit: rejectedDeposit
        });

    } catch (error) {

        console.error(
            "NOVAPAY REJECT DEPOSIT SERVER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to reject deposit."
        });
    }
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
    createDeposit,
    getDepositHistory,
    getPendingDeposits,
    approveDeposit,
    rejectDeposit
};