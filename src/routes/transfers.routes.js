"use strict";

const express = require("express");

const {
    requireAuth,
    requireAdmin
} = require("../middleware/auth");


const {
    createTransfer,
    getRecipientByAccountNumber,
    getTransactions,
    getPendingTransfers,
    approveTransfer,
    rejectTransfer,
    quickPayAdmin
} = require("../controllers/transfers.controller");


const router =
    express.Router();


/*
 * =========================================================
 * NOVAPAY RECIPIENT LOOKUP
 * =========================================================
 */

router.get(
    "/recipient/:accountNumber",
    requireAuth,
    getRecipientByAccountNumber
);


/*
 * =========================================================
 * CREATE TRANSFER
 * =========================================================
 */

router.post(
    "/",
    requireAuth,
    createTransfer
);


/*
 * =========================================================
 * USER TRANSACTION HISTORY
 * =========================================================
 */

router.get(
    "/history",
    requireAuth,
    getTransactions
);


/*
 * =========================================================
 * ADMIN PENDING TRANSFERS
 * =========================================================
 */

router.get(
    "/admin/pending",
    requireAuth,
    requireAdmin,
    getPendingTransfers
);


/*
 * =========================================================
 * ADMIN APPROVE
 * =========================================================
 */

router.post(
    "/admin/approve",
    requireAuth,
    requireAdmin,
    approveTransfer
);


/*
 * =========================================================
 * ADMIN REJECT
 * =========================================================
 */

router.post(
    "/admin/reject",
    requireAuth,
    requireAdmin,
    rejectTransfer
);


/*
 * =========================================================
 * ADMIN QUICK PAY
 * =========================================================
 */

router.post(
    "/admin/quick-pay",
    requireAuth,
    requireAdmin,
    quickPayAdmin
);


module.exports = router;