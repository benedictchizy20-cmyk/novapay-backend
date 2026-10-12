"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const airwallexRoutes = require("./routes/airwallex.routes");
const depositRoutes = require("./routes/deposits.routes");
const profileRoutes = require("./routes/profile.routes");
const loanRoutes = require("./routes/loans.routes");

/* =========================================================
   ROUTES
========================================================= */

const authRoutes =
    require("./routes/auth.routes");

const transferRoutes =
    require("./routes/transfers.routes");

const notificationRoutes =
    require("./routes/notifications.routes");

/* =========================================================
   APP
========================================================= */

const app = express();

const PORT =
    process.env.PORT || 7000;

/* =========================================================
   SECURITY
========================================================= */

app.use(
    helmet()
);

/* =========================================================
   CORS
========================================================= */

const allowedOrigins = [
    "http://localhost:5500",
    "https://novapay-webapp.vercel.app",
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests without an Origin header, such as
            // server-to-server requests and command-line tools.
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.warn("CORS blocked origin:", origin);

            return callback(
                new Error("Origin not allowed by CORS")
            );
        },
        credentials: true
    })
);


/* =========================================================
   BODY PARSING
========================================================= */

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);

app.use(
    cookieParser()
);

/* =========================================================
   RATE LIMIT
========================================================= */

const apiLimiter =
    rateLimit({
        windowMs:
            15 * 60 * 1000,

        max:
            200,

        standardHeaders:
            true,

        legacyHeaders:
            false,

        message: {
            success:
                false,

            message:
                "Too many requests. Please try again later."
        }
    });

app.use(
    "/api",
    apiLimiter
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/api/health",
    (req, res) => {
        res.status(200).json({
            success:
                true,

            message:
                "NovaPay API is running",

            timestamp:
                new Date().toISOString()
        });
    }
);

/* =========================================================
   AUTH ROUTES
========================================================= */

app.use(
    "/api/auth",
    authRoutes
);

/* =========================================================
   TRANSFER ROUTES
========================================================= */

app.use(
    "/api/transfers",
    transferRoutes
);

app.use("/api/airwallex", airwallexRoutes);

app.use("/api/deposits", depositRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/loans", loanRoutes);

/* =========================================================
   NOTIFICATION ROUTES
========================================================= */

app.use(
    "/api/notifications",
    notificationRoutes
);

/* =========================================================
   ROOT
========================================================= */

app.get(
    "/",
    (req, res) => {
        res.json({
            success:
                true,

            message:
                "NovaPay API is running"
        });
    }
);

/* =========================================================
   404
========================================================= */

app.use(
    (req, res) => {
        res.status(404).json({
            success:
                false,

            message:
                "API route not found"
        });
    }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    (err, req, res, next) => {
        console.error(
            "NOVAPAY SERVER ERROR:",
            err
        );

        res.status(
            err.status || 500
        ).json({
            success:
                false,

            message:
                err.message ||
                "Internal server error"
        });
    }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    () => {
        console.log(
            "=========================================="
        );

        console.log(
            "NOVAPAY BACKEND"
        );

        console.log(
            "=========================================="
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            `Frontend allowed: ${
                process.env.FRONTEND_URL ||
                "http://localhost:5500"
            }`
        );

        console.log(
            "=========================================="
        );
    }
);