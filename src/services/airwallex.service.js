"use strict";

const AIRWALLEX_BASE_URL =
    process.env.AIRWALLEX_BASE_URL ||
    "https://api.sandbox.airwallex.com/api/v1";

const CLIENT_ID = process.env.AIRWALLEX_CLIENT_ID;
const API_KEY = process.env.AIRWALLEX_API_KEY;
const ACCOUNT_ID = process.env.AIRWALLEX_ACCOUNT_ID;

let cachedToken = null;
let tokenExpiresAt = 0;


/* =========================================================
   CHECK CONFIGURATION
========================================================= */

function validateConfig() {
    if (!CLIENT_ID) {
        throw new Error("AIRWALLEX_CLIENT_ID is missing.");
    }

    if (!API_KEY) {
        throw new Error("AIRWALLEX_API_KEY is missing.");
    }

    if (!ACCOUNT_ID) {
        throw new Error("AIRWALLEX_ACCOUNT_ID is missing.");
    }
}


/* =========================================================
   GET AIRWALLEX ACCESS TOKEN
========================================================= */

async function getAccessToken() {
    validateConfig();

    const now = Date.now();

    // Reuse existing token while it is still valid.
    if (
        cachedToken &&
        now < tokenExpiresAt - 60 * 1000
    ) {
        return cachedToken;
    }

    const response = await fetch(
        `${AIRWALLEX_BASE_URL}/authentication/login`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-client-id": CLIENT_ID,
                "x-api-key": API_KEY
            }
        }
    );

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        console.error(
            "AIRWALLEX AUTHENTICATION ERROR:",
            data
        );

        throw new Error(
            data.message ||
            data.error ||
            `Airwallex authentication failed (${response.status}).`
        );
    }

    if (!data.token) {
        throw new Error(
            "Airwallex did not return an access token."
        );
    }

    cachedToken = data.token;

    if (data.expires_at) {
        tokenExpiresAt =
            new Date(data.expires_at).getTime();
    } else {
        // Fallback: 29 minutes.
        tokenExpiresAt =
            Date.now() + 29 * 60 * 1000;
    }

    return cachedToken;
}


/* =========================================================
   AIRWALLEX API REQUEST
========================================================= */

async function airwallexRequest(
    endpoint,
    options = {}
) {
    const token = await getAccessToken();

    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
    };

    const response = await fetch(
        `${AIRWALLEX_BASE_URL}${endpoint}`,
        {
            ...options,
            headers
        }
    );

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        console.error(
            "AIRWALLEX API ERROR:",
            response.status,
            data
        );

        const error = new Error(
            data.message ||
            data.error ||
            `Airwallex API request failed (${response.status}).`
        );

        error.status = response.status;
        error.data = data;

        throw error;
    }

    return data;
}


/* =========================================================
   TEST ACCOUNT BALANCE
========================================================= */

async function getBalances() {
    return airwallexRequest(
        `/balances/current?account_id=${encodeURIComponent(
            ACCOUNT_ID
        )}`,
        {
            method: "GET"
        }
    );
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
    getAccessToken,
    airwallexRequest,
    getBalances
};