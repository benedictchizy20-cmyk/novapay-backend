"use strict";

const {
    getAccessToken,
    getBalances
} = require("../services/airwallex.service");


/* =========================================================
   TEST AIRWALLEX CONNECTION
========================================================= */

async function testAirwallex(req, res) {
    try {
        await getAccessToken();

        return res.json({
            success: true,
            message: "Airwallex connection successful.",
            environment: "sandbox"
        });
    } catch (error) {
        console.error(
            "NOVAPAY AIRWALLEX CONNECTION ERROR:",
            error
        );

        return res.status(
            error.status || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Unable to connect to Airwallex."
        });
    }
}


/* =========================================================
   GET AIRWALLEX BALANCES
========================================================= */

async function getAirwallexBalances(req, res) {
    try {
        const balances = await getBalances();

        return res.json({
            success: true,
            balances
        });
    } catch (error) {
        console.error(
            "NOVAPAY AIRWALLEX BALANCE ERROR:",
            error
        );

        return res.status(
            error.status || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Unable to load Airwallex balances."
        });
    }
}


module.exports = {
    testAirwallex,
    getAirwallexBalances
};