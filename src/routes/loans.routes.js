"use strict";

const express = require("express");
const router = express.Router();

const {
    requireAuth,
    requireAdmin
} = require("../middleware/auth");

const {
    createLoan,
    getMyLoans,
    getMyLoanNotifications,
    markLoanNotificationRead,
    getAllLoansForAdmin,
    reviewLoan
} = require("../controllers/loans.controller");

// Every endpoint in this router requires authentication.
router.use(requireAuth);

// User endpoints
router.post("/", createLoan);
router.get("/", getMyLoans);

router.get("/notifications", getMyLoanNotifications);
router.patch(
    "/notifications/:id/read",
    markLoanNotificationRead
);

// Admin-only endpoints
// Keep these routes before any future /:id route.
router.get(
    "/admin",
    requireAdmin,
    getAllLoansForAdmin
);

router.patch(
    "/admin/:id/review",
    requireAdmin,
    reviewLoan
);

module.exports = router;