"use strict";

const express = require("express");

const {
    requireAuth,
    requireAdmin
} = require("../middleware/auth");

const {
    testAirwallex,
    getAirwallexBalances
} = require("../controllers/airwallex.controller");

const router = express.Router();


/* =========================================================
   TEST CONNECTION
========================================================= */

router.get(
    "/test",
    requireAuth,
    requireAdmin,
    testAirwallex
);


/* =========================================================
   AIRWALLEX BALANCES
========================================================= */

router.get(
    "/balances",
    requireAuth,
    requireAdmin,
    getAirwallexBalances
);


module.exports = router;