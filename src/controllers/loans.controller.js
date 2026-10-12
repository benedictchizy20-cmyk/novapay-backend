"use strict";

const supabase = require("../config/supabase");

const ALLOWED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];

function sendError(res, status, message) {
    return res.status(status).json({
        success: false,
        message
    });
}

function getUserId(req) {
    return req.user && req.user.id;
}

function getText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function getAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : NaN;
}


// =====================================================
// USER: SUBMIT LOAN APPLICATION
// POST /api/loans
// =====================================================

async function createLoan(req, res) {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return sendError(res, 401, "Please log in to apply for a loan.");
        }

        const {
            full_name,
            email,
            phone,
            country,
            residential_address,
            employment_status,
            monthly_income,
            requested_amount,
            currency,
            term_months,
            loan_purpose
        } = req.body || {};

        const application = {
            full_name: getText(full_name),
            email: getText(email).toLowerCase(),
            phone: getText(phone),
            country: getText(country),
            residential_address: getText(residential_address),
            employment_status: getText(employment_status),
            monthly_income: getAmount(monthly_income),
            requested_amount: getAmount(requested_amount),
            currency: getText(currency).toUpperCase(),
            term_months: Number(term_months),
            loan_purpose: getText(loan_purpose)
        };

        const requiredFields = [
            application.full_name,
            application.email,
            application.phone,
            application.country,
            application.residential_address,
            application.employment_status,
            application.loan_purpose
        ];

        if (requiredFields.some(value => !value)) {
            return sendError(
                res,
                400,
                "Please complete all required application fields."
            );
        }

        if (
            !Number.isFinite(application.monthly_income) ||
            application.monthly_income <= 0
        ) {
            return sendError(
                res,
                400,
                "Enter a valid monthly income greater than zero."
            );
        }

        if (
            !Number.isFinite(application.requested_amount) ||
            application.requested_amount <= 0
        ) {
            return sendError(
                res,
                400,
                "Enter a valid loan amount greater than zero."
            );
        }

        if (!ALLOWED_CURRENCIES.includes(application.currency)) {
            return sendError(res, 400, "Select a supported loan currency.");
        }

        if (
            !Number.isInteger(application.term_months) ||
            application.term_months < 1 ||
            application.term_months > 120
        ) {
            return sendError(
                res,
                400,
                "The loan term must be between 1 and 120 months."
            );
        }

        // The authenticated user ID comes from the verified token,
        // never from the submitted form.
        const { data: loan, error } = await supabase
            .from("loans")
            .insert({
                ...application,
                user_id: userId,
                status: "pending"
            })
            .select("*")
            .single();

        if (error) {
            console.error("NOVAPAY CREATE LOAN ERROR:", error);
            return sendError(
                res,
                500,
                "Unable to submit your application. Please try again."
            );
        }

        const { error: notificationError } = await supabase
            .from("loan_notifications")
            .insert({
                user_id: userId,
                loan_id: loan.id,
                type: "loan_submitted",
                title: "Loan application received",
                message:
                    "Your loan application has been received and is awaiting admin review."
            });

        if (notificationError) {
            // The application was saved successfully. Report the
            // notification failure to the server logs for investigation.
            console.error(
                "NOVAPAY LOAN NOTIFICATION ERROR:",
                notificationError
            );
        }

        return res.status(201).json({
            success: true,
            message: "Your loan application was submitted successfully.",
            loan
        });
    } catch (error) {
        console.error("NOVAPAY CREATE LOAN ERROR:", error);
        return sendError(res, 500, "An unexpected server error occurred.");
    }
}


// =====================================================
// USER: GET THEIR OWN LOAN APPLICATIONS
// GET /api/loans
// =====================================================

async function getMyLoans(req, res) {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return sendError(res, 401, "Authentication is required.");
        }

        const { data, error } = await supabase
            .from("loans")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("NOVAPAY GET LOANS ERROR:", error);
            return sendError(res, 500, "Unable to load your applications.");
        }

        return res.json({
            success: true,
            loans: data || []
        });
    } catch (error) {
        console.error("NOVAPAY GET LOANS ERROR:", error);
        return sendError(res, 500, "An unexpected server error occurred.");
    }
}


// =====================================================
// USER: GET THEIR OWN LOAN NOTIFICATIONS
// GET /api/loans/notifications
// =====================================================

async function getMyLoanNotifications(req, res) {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return sendError(res, 401, "Authentication is required.");
        }

        const { data, error } = await supabase
            .from("loan_notifications")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(50);

        if (error) {
            console.error("NOVAPAY LOAN NOTIFICATIONS ERROR:", error);
            return sendError(res, 500, "Unable to load notifications.");
        }

        return res.json({
            success: true,
            notifications: data || []
        });
    } catch (error) {
        console.error("NOVAPAY LOAN NOTIFICATIONS ERROR:", error);
        return sendError(res, 500, "An unexpected server error occurred.");
    }
}


// =====================================================
// USER: MARK A LOAN NOTIFICATION AS READ
// PATCH /api/loans/notifications/:id/read
// =====================================================

async function markLoanNotificationRead(req, res) {
    try {
        const userId = getUserId(req);
        const notificationId = req.params.id;

        if (!userId) {
            return sendError(res, 401, "Authentication is required.");
        }

        const { data, error } = await supabase
            .from("loan_notifications")
            .update({ is_read: true })
            .eq("id", notificationId)
            .eq("user_id", userId)
            .select("id")
            .maybeSingle();

        if (error) {
            console.error("NOVAPAY MARK NOTIFICATION ERROR:", error);
            return sendError(res, 500, "Unable to update notification.");
        }

        if (!data) {
            return sendError(res, 404, "Notification not found.");
        }

        return res.json({
            success: true,
            message: "Notification marked as read."
        });
    } catch (error) {
        console.error("NOVAPAY MARK NOTIFICATION ERROR:", error);
        return sendError(res, 500, "An unexpected server error occurred.");
    }
}


// =====================================================
// ADMIN: GET ALL LOAN APPLICATIONS
// GET /api/loans/admin
// =====================================================

async function getAllLoansForAdmin(req, res) {
    try {
        const { data, error } = await supabase
            .from("loans")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("NOVAPAY ADMIN GET LOANS ERROR:", error);
            return sendError(res, 500, "Unable to load loan applications.");
        }

        return res.json({
            success: true,
            loans: data || []
        });
    } catch (error) {
        console.error("NOVAPAY ADMIN GET LOANS ERROR:", error);
        return sendError(res, 500, "An unexpected server error occurred.");
    }
}


// =====================================================
// ADMIN: APPROVE OR REJECT A LOAN
// PATCH /api/loans/admin/:id/review
// =====================================================

async function reviewLoan(req, res) {
    try {
        const adminId = getUserId(req);
        const loanId = req.params.id;

        const status = getText(req.body && req.body.status).toLowerCase();
        const adminNote = getText(req.body && req.body.admin_note);

        if (!adminId) {
            return sendError(res, 401, "Authentication is required.");
        }

        if (!["approved", "rejected"].includes(status)) {
            return sendError(
                res,
                400,
                "Choose either approved or rejected."
            );
        }

        const { data: existingLoan, error: fetchError } = await supabase
            .from("loans")
            .select("*")
            .eq("id", loanId)
            .maybeSingle();

        if (fetchError) {
            console.error("NOVAPAY ADMIN FETCH LOAN ERROR:", fetchError);
            return sendError(res, 500, "Unable to retrieve the application.");
        }

        if (!existingLoan) {
            return sendError(res, 404, "Loan application not found.");
        }

        if (existingLoan.status !== "pending") {
            return sendError(
                res,
                409,
                "This application has already been reviewed."
            );
        }

        // Conditional update prevents a second admin review from
        // overwriting an application that has already been reviewed.
        const { data: updatedLoan, error: updateError } = await supabase
            .from("loans")
            .update({
                status,
                admin_note: adminNote || null,
                reviewed_by: adminId,
                reviewed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq("id", loanId)
            .eq("status", "pending")
            .select("*")
            .maybeSingle();

        if (updateError) {
            console.error("NOVAPAY ADMIN REVIEW ERROR:", updateError);
            return sendError(res, 500, "Unable to review this application.");
        }

        if (!updatedLoan) {
            return sendError(
                res,
                409,
                "This application was already reviewed. Refresh and try again."
            );
        }

        const isApproved = status === "approved";

        const { error: notificationError } = await supabase
            .from("loan_notifications")
            .insert({
                user_id: updatedLoan.user_id,
                loan_id: updatedLoan.id,
                type: isApproved ? "loan_approved" : "loan_rejected",
                title: isApproved
                    ? "Loan application approved"
                    : "Loan application declined",
                message: isApproved
                    ? "Your loan application has been approved. Check your account for the review details."
                    : "Your loan application has been declined. Please check the review details."
            });

        if (notificationError) {
            console.error(
                "NOVAPAY REVIEW NOTIFICATION ERROR:",
                notificationError
            );
        }

        return res.json({
            success: true,
            message: isApproved
                ? "Loan application approved."
                : "Loan application rejected.",
            loan: updatedLoan,
            notificationCreated: !notificationError
        });
    } catch (error) {
        console.error("NOVAPAY ADMIN REVIEW ERROR:", error);
        return sendError(res, 500, "An unexpected server error occurred.");
    }
}


module.exports = {
    createLoan,
    getMyLoans,
    getMyLoanNotifications,
    markLoanNotificationRead,
    getAllLoansForAdmin,
    reviewLoan
};