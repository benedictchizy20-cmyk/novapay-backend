"use strict";

const express = require("express");

const supabase = require("../config/supabase");

const {
    requireAuth
} = require("../middleware/auth");

const router =
    express.Router();


/*
 * =========================================================
 * GET NOTIFICATIONS
 * =========================================================
 */

router.get(
    "/",
    requireAuth,
    async (req, res) => {

        try {

            const {
                data,
                error
            } = await supabase
                .from("notifications")
                .select(
                    `
                    id,
                    transaction_id,
                    type,
                    title,
                    message,
                    is_read,
                    created_at
                    `
                )
                .eq(
                    "user_id",
                    req.user.id
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


            if (error) {

                console.error(
                    "NOVAPAY NOTIFICATIONS ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load notifications."
                });
            }


            return res.json({

                success: true,

                notifications:
                    data || []

            });


        } catch (error) {

            console.error(
                "NOVAPAY NOTIFICATION CONTROLLER ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load notifications."
            });
        }
    }
);


/*
 * =========================================================
 * MARK ONE NOTIFICATION AS READ
 * =========================================================
 */

router.patch(
    "/:id/read",
    requireAuth,
    async (req, res) => {

        try {

            const {
                data,
                error
            } = await supabase
                .from("notifications")
                .update({
                    is_read: true
                })
                .eq(
                    "id",
                    req.params.id
                )
                .eq(
                    "user_id",
                    req.user.id
                )
                .select()
                .maybeSingle();


            if (error) {

                console.error(
                    "NOVAPAY NOTIFICATION READ ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to update notification."
                });
            }


            if (!data) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Notification not found."
                });
            }


            return res.json({

                success: true,

                notification:
                    data

            });


        } catch (error) {

            console.error(
                "NOVAPAY MARK NOTIFICATION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to update notification."
            });
        }
    }
);


module.exports = router;