"use strict";

const supabase = require("../config/supabase");


/*
 * =========================================================
 * CREATE TRANSFER
 * =========================================================
 *
 * Supports:
 *
 * 1. NovaPay → NovaPay
 * 2. NovaPay → U.S. Domestic Bank
 * 3. NovaPay → International Bank
 *
 * IMPORTANT:
 * - NovaPay → NovaPay continues using the existing secure RPC.
 * - U.S. and International transfers are stored as PENDING.
 * - No fake bank verification is performed.
 * - Real external settlement will require a banking/payment provider.
 *
 * =========================================================
 */

async function createTransfer(req, res) {

    try {

        const senderId = req.user.id;

        const {
            receiver_account_number,

            transfer_type,

            recipient_name,
            recipient_bank,
            recipient_account_number,
            recipient_account_type,
            routing_number,
            transfer_method,

            recipient_country,
            recipient_bank_country,
            recipient_currency,
            swift_bic,
            recipient_iban,

            amount,
            description
        } = req.body;


        /*
         * =====================================================
         * BASIC AMOUNT VALIDATION
         * =====================================================
         */

        const numericAmount = Number(amount);


        if (
            !Number.isFinite(numericAmount) ||
            numericAmount <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Enter a valid transfer amount."
            });
        }


        /*
         * =====================================================
         * DETERMINE TRANSFER TYPE
         * =====================================================
         */

        const type =
            transfer_type
                ? String(transfer_type).trim().toLowerCase()
                : "novapay";


        const allowedTypes = [
            "novapay",
            "us_domestic",
            "international"
        ];


        if (!allowedTypes.includes(type)) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid transfer type."
            });
        }


        /*
         * =====================================================
         * NOVAPAY → NOVAPAY
         * =====================================================
         *
         * Keep the existing secure database RPC.
         */

        if (type === "novapay") {

            if (!receiver_account_number) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Recipient NovaPay account number is required."
                });
            }


            const {
                data,
                error
            } = await supabase.rpc(
                "create_transfer",
                {
                    p_sender_id:
                        senderId,

                    p_receiver_account_number:
                        String(
                            receiver_account_number
                        ).trim(),

                    p_amount:
                        numericAmount,

                    p_description:
                        description
                            ? String(description).trim()
                            : null
                }
            );


            if (error) {

                console.error(
                    "NOVAPAY CREATE TRANSFER ERROR:",
                    error
                );

                return res.status(400).json({
                    success: false,
                    message:
                        error.message ||
                        "Unable to process transfer."
                });
            }


            /*
             * Add receipt-friendly information
             * to the returned transfer.
             */

            return res.status(201).json({

                success: true,

                message:
                    data.status === "completed"

                        ? "Transfer completed successfully."

                        : "Transfer is waiting for admin approval.",

                transfer: {
                    ...data,

                    transfer_type:
                        "novapay",

                    transfer_method:
                        "novapay",

                    recipient_account_number:
                        String(
                            receiver_account_number
                        ).trim()
                }

            });
        }


        /*
         * =====================================================
         * U.S. DOMESTIC TRANSFER VALIDATION
         * =====================================================
         */

        if (type === "us_domestic") {

            if (!recipient_name) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Recipient account holder name is required."
                });
            }


            if (!recipient_bank) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Recipient bank name is required."
                });
            }


            if (!recipient_account_number) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Recipient account number is required."
                });
            }


            if (!routing_number) {

                return res.status(400).json({
                    success: false,
                    message:
                        "U.S. routing number is required."
                });
            }


            if (!recipient_account_type) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Account type is required."
                });
            }


            if (!transfer_method) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Transfer method is required."
                });
            }


            const allowedAccountTypes = [
                "checking",
                "savings"
            ];


            if (
                !allowedAccountTypes.includes(
                    String(
                        recipient_account_type
                    ).toLowerCase()
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid U.S. bank account type."
                });
            }


            const allowedMethods = [
                "ach",
                "domestic_wire"
            ];


            if (
                !allowedMethods.includes(
                    String(
                        transfer_method
                    ).toLowerCase()
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid U.S. transfer method."
                });
            }


            /*
             * We intentionally DO NOT claim that
             * the U.S. bank account has been verified.
             *
             * Until a real banking provider is connected,
             * the transfer remains pending.
             */


            const reference =
                await generateTransferReference();


            const {
                data: sender,
                error: senderError
            } = await supabase
                .from("profiles")
                .select(
                    `
                    id,
                    full_name
                    `
                )
                .eq(
                    "id",
                    senderId
                )
                .single();


            if (senderError || !sender) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Sender profile could not be found."
                });
            }


            const {
                data: senderAccount,
                error: senderAccountError
            } = await supabase
                .from("accounts")
                .select(
                    `
                    account_number,
                    currency
                    `
                )
                .eq(
                    "user_id",
                    senderId
                )
                .single();


            if (
                senderAccountError ||
                !senderAccount
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Sender account could not be found."
                });
            }


            /*
             * Check balance before creating the
             * external transfer request.
             *
             * We do NOT debit the balance here.
             * That remains part of the approval/provider
             * settlement flow.
             */

            const {
                data: balanceAccount,
                error: balanceError
            } = await supabase
                .from("accounts")
                .select(
                    `
                    balance,
                    status,
                    currency
                    `
                )
                .eq(
                    "user_id",
                    senderId
                )
                .single();


            if (
                balanceError ||
                !balanceAccount
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Sender account could not be found."
                });
            }


            if (
                balanceAccount.status &&
                balanceAccount.status !== "active"
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Your account is not active."
                });
            }


            if (
                Number(balanceAccount.balance) <
                numericAmount
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Insufficient balance."
                });
            }


            const {
                data: transaction,
                error: transactionError
            } = await supabase
                .from("transactions")
                .insert({

                    transaction_reference:
                        reference,

                    sender_id:
                        senderId,

                    receiver_id:
                        null,

                    amount:
                        numericAmount,

                    currency:
                        balanceAccount.currency || "$",

                    transaction_type:
                        "transfer",

                    status:
                        "pending",

                    description:
                        description
                            ? String(description).trim()
                            : null,

                    sender_name_snapshot:
                        sender.full_name,

                    receiver_name_snapshot:
                        String(
                            recipient_name
                        ).trim(),

                    sender_account_snapshot:
                        senderAccount.account_number,

                    receiver_account_snapshot:
                        String(
                            recipient_account_number
                        ).trim(),

                    transfer_type:
                        "us_domestic",

                    recipient_name:
                        String(
                            recipient_name
                        ).trim(),

                    recipient_bank:
                        String(
                            recipient_bank
                        ).trim(),

                    recipient_account_number:
                        String(
                            recipient_account_number
                        ).trim(),

                    recipient_account_type:
                        String(
                            recipient_account_type
                        ).trim().toLowerCase(),

                    routing_number:
                        String(
                            routing_number
                        ).trim(),

                    transfer_method:
                        String(
                            transfer_method
                        ).trim().toLowerCase(),

                    recipient_currency:
                        "USD"

                })
                .select()
                .single();


            if (transactionError) {

                console.error(
                    "U.S. DOMESTIC TRANSFER INSERT ERROR:",
                    transactionError
                );

                return res.status(400).json({
                    success: false,
                    message:
                        transactionError.message ||
                        "Unable to create U.S. transfer."
                });
            }


            return res.status(201).json({

                success: true,

                message:
                    "U.S. domestic transfer is pending approval.",

                transfer:
                    transaction

            });

        }


        /*
         * =====================================================
         * INTERNATIONAL TRANSFER
         * =====================================================
         */

        if (type === "international") {

            if (!recipient_name) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Recipient name is required."
                });
            }


            if (!recipient_country) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Recipient country is required."
                });
            }


            if (!recipient_bank) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Recipient bank name is required."
                });
            }


            if (
                !recipient_account_number &&
                !recipient_iban
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Recipient account number or IBAN is required."
                });
            }


            if (!swift_bic) {

                return res.status(400).json({
                    success: false,
                    message:
                        "SWIFT/BIC is required."
                });
            }


            const reference =
                await generateTransferReference();


            const {
                data: sender,
                error: senderError
            } = await supabase
                .from("profiles")
                .select(
                    `
                    id,
                    full_name
                    `
                )
                .eq(
                    "id",
                    senderId
                )
                .single();


            if (
                senderError ||
                !sender
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Sender profile could not be found."
                });
            }


            const {
                data: senderAccount,
                error: senderAccountError
            } = await supabase
                .from("accounts")
                .select(
                    `
                    account_number,
                    currency,
                    balance,
                    status
                    `
                )
                .eq(
                    "user_id",
                    senderId
                )
                .single();


            if (
                senderAccountError ||
                !senderAccount
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Sender account could not be found."
                });
            }


            if (
                senderAccount.status &&
                senderAccount.status !== "active"
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Your account is not active."
                });
            }


            if (
                Number(senderAccount.balance) <
                numericAmount
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Insufficient balance."
                });
            }


            const {
                data: transaction,
                error: transactionError
            } = await supabase
                .from("transactions")
                .insert({

                    transaction_reference:
                        reference,

                    sender_id:
                        senderId,

                    receiver_id:
                        null,

                    amount:
                        numericAmount,

                    currency:
                        senderAccount.currency || "$",

                    transaction_type:
                        "transfer",

                    status:
                        "pending",

                    description:
                        description
                            ? String(description).trim()
                            : null,

                    sender_name_snapshot:
                        sender.full_name,

                    receiver_name_snapshot:
                        String(
                            recipient_name
                        ).trim(),

                    sender_account_snapshot:
                        senderAccount.account_number,

                    receiver_account_snapshot:
                        String(
                            recipient_account_number ||
                            recipient_iban ||
                            ""
                        ).trim(),

                    transfer_type:
                        "international",

                    recipient_name:
                        String(
                            recipient_name
                        ).trim(),

                    recipient_bank:
                        String(
                            recipient_bank
                        ).trim(),

                    recipient_account_number:
                        recipient_account_number
                            ? String(
                                recipient_account_number
                            ).trim()
                            : null,

                    recipient_country:
                        String(
                            recipient_country
                        ).trim(),

                    recipient_bank_country:
                        recipient_bank_country
                            ? String(
                                recipient_bank_country
                            ).trim()
                            : null,

                    recipient_currency:
                        recipient_currency
                            ? String(
                                recipient_currency
                            ).trim().toUpperCase()
                            : "USD",

                    swift_bic:
                        String(
                            swift_bic
                        ).trim().toUpperCase(),

                    recipient_iban:
                        recipient_iban
                            ? String(
                                recipient_iban
                            ).trim().toUpperCase()
                            : null,

                    transfer_method:
                        transfer_method
                            ? String(
                                transfer_method
                            ).trim().toLowerCase()
                            : "international_wire"

                })
                .select()
                .single();


            if (transactionError) {

                console.error(
                    "INTERNATIONAL TRANSFER INSERT ERROR:",
                    transactionError
                );

                return res.status(400).json({
                    success: false,
                    message:
                        transactionError.message ||
                        "Unable to create international transfer."
                });
            }


            return res.status(201).json({

                success: true,

                message:
                    "International transfer is pending approval.",

                transfer:
                    transaction

            });

        }

    } catch (error) {

        console.error(
            "NOVAPAY TRANSFER CONTROLLER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to process transfer."
        });
    }
}


/*
 * =========================================================
 * GENERATE TRANSFER REFERENCE
 * =========================================================
 */

async function generateTransferReference() {

    const now =
        new Date();

    const year =
        now.getUTCFullYear();

    const month =
        String(
            now.getUTCMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            now.getUTCDate()
        ).padStart(2, "0");


    const random =
        Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();


    return `NP-${year}${month}${day}-${random}`;
}


/*
 * =========================================================
 * NOVAPAY RECIPIENT LOOKUP
 * =========================================================
 *
 * GET:
 * /api/transfers/recipient/:accountNumber
 *
 * Used by the Transfers page to automatically
 * display the recipient's NovaPay name.
 *
 * =========================================================
 */


/*
 * =========================================================
 * NOVAPAY RECIPIENT LOOKUP
 * =========================================================
 *
 * Account number: profiles.account_number
 * Account status: accounts.status
 *
 * GET /api/transfers/recipient/:accountNumber
 * =========================================================
 */

async function getRecipientByAccountNumber(req, res) {
    try {
        const accountNumber = String(
            req.params.accountNumber || ""
        ).trim();

        if (!/^\d{10}$/.test(accountNumber)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid 10-digit NovaPay account number."
            });
        }

        // 1. Find the recipient using the correct table.
        const {
            data: profile,
            error: profileError
        } = await supabase
            .from("profiles")
            .select("id, full_name, account_number")
            .eq("account_number", accountNumber)
            .maybeSingle();

        if (profileError) {
            console.error(
                "RECIPIENT PROFILE LOOKUP ERROR:",
                profileError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify recipient account."
            });
        }

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "NovaPay account not found."
            });
        }

        // Prevent sending money to the logged-in user's own account.
        if (profile.id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: "You cannot transfer money to your own account."
            });
        }

        // 2. Check that the recipient has an active account.
        const {
            data: activeAccount,
            error: accountError
        } = await supabase
            .from("accounts")
            .select("id, status")
            .eq("user_id", profile.id)
            .eq("status", "active")
            .limit(1)
            .maybeSingle();

        if (accountError) {
            console.error(
                "RECIPIENT ACCOUNT STATUS ERROR:",
                accountError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify recipient account status."
            });
        }

        if (!activeAccount) {
            return res.status(400).json({
                success: false,
                message: "This NovaPay account is not active."
            });
        }

        // 3. Return the recipient details to the frontend.
        return res.status(200).json({
            success: true,
            recipient: {
                name: profile.full_name,
                bank: "NovaPay",
                account_number: profile.account_number
            }
        });

    } catch (error) {
        console.error(
            "RECIPIENT LOOKUP CONTROLLER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to verify recipient."
        });
    }
}


/*
 * =========================================================
 * GET USER TRANSACTION HISTORY
 * =========================================================
 */

async function getTransactions(
    req,
    res
) {

    try {

        const userId =
            req.user.id;


        const {
            data,
            error
        } = await supabase
            .from("transactions")
            .select(
                `
                id,
                transaction_reference,
                sender_id,
                receiver_id,
                amount,
                currency,
                transaction_type,
                status,
                description,

                transfer_type,
                recipient_name,
                recipient_bank,
                recipient_account_number,
                recipient_account_type,
                routing_number,
                transfer_method,
                recipient_country,
                recipient_bank_country,
                recipient_currency,
                swift_bic,
                recipient_iban,

                sender_name_snapshot,
                receiver_name_snapshot,
                sender_account_snapshot,
                receiver_account_snapshot,

                created_at,
                approved_at,
                rejected_at,
                rejection_reason,
                approved_by,
                rejected_by
                `
            )
            .or(
                `sender_id.eq.${userId},receiver_id.eq.${userId}`
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (error) {

            console.error(
                "NOVAPAY TRANSACTIONS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load transaction history."
            });
        }


        const transactions =
            (data || []).map(
                transaction => {

                    const isSender =
                        transaction.sender_id ===
                        userId;


                    return {

                        ...transaction,

                        direction:
                            isSender
                                ? "outgoing"
                                : "incoming",

                        display_name:
                            isSender
                                ? (
                                    transaction.recipient_name ||
                                    transaction.receiver_name_snapshot
                                )
                                : transaction.sender_name_snapshot,

                        display_message:
                            isSender

                                ? `Transfer to ${
                                    transaction.recipient_name ||
                                    transaction.receiver_name_snapshot ||
                                    "recipient"
                                }`

                                : `Money received from ${
                                    transaction.sender_name_snapshot ||
                                    "sender"
                                }`

                    };

                }
            );


        return res.json({

            success: true,

            transactions

        });


    } catch (error) {

        console.error(
            "NOVAPAY TRANSACTION HISTORY ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load transaction history."
        });
    }
}


/*
 * =========================================================
 * ADMIN - PENDING TRANSFERS
 * =========================================================
 */

async function getPendingTransfers(
    req,
    res
) {

    try {

        const {
            data,
            error
        } = await supabase
            .from("transactions")
            .select(
                `
                id,
                transaction_reference,
                sender_id,
                receiver_id,
                amount,
                currency,
                transaction_type,
                status,
                description,

                transfer_type,
                recipient_name,
                recipient_bank,
                recipient_account_number,
                recipient_account_type,
                routing_number,
                transfer_method,
                recipient_country,
                recipient_bank_country,
                recipient_currency,
                swift_bic,
                recipient_iban,

                sender_name_snapshot,
                receiver_name_snapshot,
                sender_account_snapshot,
                receiver_account_snapshot,

                created_at
                `
            )
            .eq(
                "status",
                "pending"
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );


        if (error) {

            console.error(
                "NOVAPAY PENDING TRANSFERS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load pending transfers."
            });
        }


        return res.json({

            success: true,

            transfers:
                data || []

        });


    } catch (error) {

        console.error(
            "NOVAPAY PENDING TRANSFERS CONTROLLER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load pending transfers."
        });
    }
}


/*
 * =========================================================
 * ADMIN - APPROVE TRANSFER
 * =========================================================
 */

async function approveTransfer(
    req,
    res
) {

    try {

        const adminId =
            req.user.id;

        const {
            transaction_id
        } = req.body;


        if (!transaction_id) {

            return res.status(400).json({
                success: false,
                message:
                    "Transaction ID is required."
            });
        }


        const {
            data,
            error
        } = await supabase.rpc(
            "approve_transfer",
            {
                p_admin_id:
                    adminId,

                p_transaction_id:
                    transaction_id
            }
        );


        if (error) {

            console.error(
                "NOVAPAY APPROVE TRANSFER ERROR:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Unable to approve transfer."
            });
        }


        return res.json({

            success: true,

            message:
                "Transfer approved successfully.",

            transfer:
                data

        });


    } catch (error) {

        console.error(
            "NOVAPAY APPROVE CONTROLLER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to approve transfer."
        });
    }
}


/*
 * =========================================================
 * ADMIN - REJECT TRANSFER
 * =========================================================
 */

async function rejectTransfer(
    req,
    res
) {

    try {

        const adminId =
            req.user.id;

        const {
            transaction_id,
            reason
        } = req.body;


        if (!transaction_id) {

            return res.status(400).json({
                success: false,
                message:
                    "Transaction ID is required."
            });
        }


        const {
            data,
            error
        } = await supabase.rpc(
            "reject_transfer",
            {
                p_admin_id:
                    adminId,

                p_transaction_id:
                    transaction_id,

                p_reason:
                    reason
                        ? String(reason).trim()
                        : "Transfer rejected by admin"
            }
        );


        if (error) {

            console.error(
                "NOVAPAY REJECT TRANSFER ERROR:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Unable to reject transfer."
            });
        }


        return res.json({

            success: true,

            message:
                "Transfer rejected successfully.",

            transfer:
                data

        });


    } catch (error) {

        console.error(
            "NOVAPAY REJECT CONTROLLER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to reject transfer."
        });
    }
}


/*
 * =========================================================
 * ADMIN QUICK PAY
 * =========================================================
 */

async function quickPayAdmin(
    req,
    res
) {

    try {

        const adminId =
            req.user.id;


        const {
            data,
            error
        } = await supabase.rpc(
            "quick_pay_admin",
            {
                p_admin_id:
                    adminId
            }
        );


        if (error) {

            console.error(
                "QUICK PAY ERROR:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Quick Pay failed."
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "$100,000 has been added to your balance.",

            quick_pay:
                data

        });

    } catch (error) {

        console.error(
            "QUICK PAY SERVER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Quick Pay failed."
        });
    }
}


module.exports = {

    createTransfer,

    getRecipientByAccountNumber,

    getTransactions,

    getPendingTransfers,

    approveTransfer,

    rejectTransfer,

    quickPayAdmin

};