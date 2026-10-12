"use strict";

const express = require("express");

const {
    requireAuth,
    requireAdmin
} = require("../middleware/auth");

const {
    createDeposit,
    getDepositHistory,
    getPendingDeposits,
    approveDeposit,
    rejectDeposit
} = require("../controllers/deposits.controller");

const router = express.Router();


/* =========================================================
   USER DEPOSITS
========================================================= */

router.post(
    "/",
    requireAuth,
    createDeposit
);


router.get(
    "/history",
    requireAuth,
    getDepositHistory
);


/* =========================================================
   ADMIN DEPOSIT APPROVALS
========================================================= */

router.get(
    "/admin/pending",
    requireAuth,
    requireAdmin,
    getPendingDeposits
);


router.post(
    "/admin/approve",
    requireAuth,
    requireAdmin,
    approveDeposit
);


router.post(
    "/admin/reject",
    requireAuth,
    requireAdmin,
    rejectDeposit
);


module.exports = router;