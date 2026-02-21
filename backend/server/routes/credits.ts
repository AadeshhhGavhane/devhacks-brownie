// ============================================
// Scribble Clone — Credits Routes
// Buy credits via PhonePe, check balance, webhook
// ============================================

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { User } from "../models/User";
import { Transaction } from "../models/Transaction";
import { authenticate } from "../middleware/authenticate";
import { env } from "../config/env";
import {
    initiatePayment,
    checkStatus,
    verifyWebhookAuth,
} from "../services/phonepe";
import { join } from "path";

const router = Router();
const PUBLIC_DIR = join(import.meta.dir, "..", "..", "public");

// Valid credit packs: credits = rupees (1:1)
const VALID_PACKS = [100, 500, 1000] as const;
type CreditPack = (typeof VALID_PACKS)[number];

const buySchema = z.object({
    pack: z.number().refine((v): v is CreditPack => VALID_PACKS.includes(v as CreditPack), {
        message: "Invalid pack. Choose 100, 500, or 1000.",
    }),
});

// ---- GET /credits/balance ----
router.get("/balance", authenticate, async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.userId).select("credits");
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        res.json({ credits: user.credits });
    } catch (err) {
        console.error("Credits balance error:", err);
        res.status(500).json({ error: "Failed to fetch balance" });
    }
});

// ---- GET /credits/history ----
router.get("/history", authenticate, async (req: Request, res: Response) => {
    try {
        const transactions = await Transaction.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .limit(20)
            .select("merchantOrderId credits amountPaise state createdAt");
        res.json({ transactions });
    } catch (err) {
        console.error("Credits history error:", err);
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// ---- POST /credits/buy ----
router.post("/buy", authenticate, async (req: Request, res: Response) => {
    try {
        const parsed = buySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid pack" });
            return;
        }

        const { pack } = parsed.data;
        const amountPaise = pack * 100; // 1 credit = ₹1 = 100 paise
        const merchantOrderId = `ORDER_${req.userId}_${Date.now()}`;

        // Create transaction record (INITIATED)
        await Transaction.create({
            userId: req.userId,
            merchantOrderId,
            credits: pack,
            amountPaise,
            state: "INITIATED",
        });

        // Build redirect URL — use the origin the user is actually on (ngrok, etc.)
        const origin = req.headers.origin || req.headers.referer?.replace(/\/+$/, '') || env.FRONTEND_URL;
        const baseUrl = origin.replace(/\/+$/, '');
        const redirectUrl = `${baseUrl}/credits/status/${merchantOrderId}`;

        // Initiate PhonePe payment
        const paymentRedirectUrl = await initiatePayment(merchantOrderId, amountPaise, redirectUrl);

        res.json({ redirectUrl: paymentRedirectUrl, merchantOrderId });
    } catch (err: any) {
        console.error("Credits buy error:", err.response?.data || err.message);
        res.status(500).json({ error: "Payment initiation failed" });
    }
});

// ---- GET /credits/status/:merchantOrderId (redirect landing after PhonePe) ----
// This is NOT behind authenticate — user is redirected here from PhonePe
router.get("/status/:merchantOrderId", async (req: Request, res: Response) => {
    const merchantOrderId = req.params.merchantOrderId as string;
    // Derive origin from the request URL so redirects go back to the right host
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const requestOrigin = `${proto}://${host}`;

    try {
        // Find the transaction
        const txn = await Transaction.findOne({ merchantOrderId });
        if (!txn) {
            res.status(404).send(buildStatusPage("ERROR", "Transaction not found", merchantOrderId, undefined, requestOrigin));
            return;
        }

        // If already completed, just show success (idempotent)
        if (txn.state === "COMPLETED") {
            res.send(buildStatusPage("COMPLETED", null, merchantOrderId, txn.credits, requestOrigin));
            return;
        }

        // Check status with PhonePe
        const status = await checkStatus(merchantOrderId);

        if (status.state === "COMPLETED") {
            // Atomic: only credit if not already completed
            const updated = await Transaction.findOneAndUpdate(
                { merchantOrderId, state: { $ne: "COMPLETED" } },
                {
                    state: "COMPLETED",
                    phonepeOrderId: status.orderId,
                    transactionId: status.transactionId,
                },
                { new: true }
            );

            if (updated) {
                // Grant credits
                await User.findByIdAndUpdate(txn.userId, {
                    $inc: { credits: txn.credits },
                });
                console.log(`✅ Credits granted: ${txn.credits} to user ${txn.userId} (order ${merchantOrderId})`);
            }

            res.send(buildStatusPage("COMPLETED", null, merchantOrderId, txn.credits, requestOrigin));
        } else if (status.state === "FAILED") {
            await Transaction.findOneAndUpdate(
                { merchantOrderId, state: "INITIATED" },
                { state: "FAILED", phonepeOrderId: status.orderId }
            );
            res.send(buildStatusPage("FAILED", "Payment failed", merchantOrderId, undefined, requestOrigin));
        } else {
            // PENDING — auto-refresh
            res.send(buildStatusPage("PENDING", null, merchantOrderId, undefined, requestOrigin));
        }
    } catch (err: any) {
        console.error("Credits status error:", err.response?.data || err.message);
        res.send(buildStatusPage("ERROR", "Failed to check payment status", merchantOrderId, undefined, requestOrigin));
    }
});

// ---- POST /credits/webhook (PhonePe webhook) ----
// No auth middleware — uses PhonePe's SHA-256 auth
router.post("/webhook", async (req: Request, res: Response) => {
    try {
        const authHeader = (req.headers.authorization || req.headers["x-authorization"]) as string | undefined;

        if (!verifyWebhookAuth(authHeader)) {
            console.warn("⚠️ Webhook: invalid auth header");
            // Still return 200 to prevent retries during dev
        }

        const webhookData = req.body;
        const payload = webhookData.payload || webhookData;
        const merchantOrderId = payload.merchantOrderId || webhookData.merchantOrderId;
        const state = payload.state || webhookData.state;
        const orderId = payload.orderId || webhookData.orderId;
        const paymentDetails = payload.paymentDetails || [];
        const transactionId = paymentDetails.length > 0 ? paymentDetails[0].transactionId : null;

        console.log(`📥 Webhook: order=${merchantOrderId} state=${state}`);

        if (state === "COMPLETED" && merchantOrderId) {
            // Atomic: only credit if not already completed
            const txn = await Transaction.findOneAndUpdate(
                { merchantOrderId, state: { $ne: "COMPLETED" } },
                {
                    state: "COMPLETED",
                    phonepeOrderId: orderId,
                    transactionId,
                },
                { new: true }
            );

            if (txn) {
                await User.findByIdAndUpdate(txn.userId, {
                    $inc: { credits: txn.credits },
                });
                console.log(`✅ Webhook: ${txn.credits} credits granted to user ${txn.userId}`);
            } else {
                console.log(`ℹ️ Webhook: order ${merchantOrderId} already processed`);
            }
        } else if (state === "FAILED" && merchantOrderId) {
            await Transaction.findOneAndUpdate(
                { merchantOrderId, state: "INITIATED" },
                { state: "FAILED", phonepeOrderId: orderId }
            );
            console.log(`❌ Webhook: payment failed for ${merchantOrderId}`);
        }

        // Always return 200 OK
        res.status(200).json({ success: true });
    } catch (err: any) {
        console.error("Webhook error:", err.message);
        res.status(200).json({ success: false });
    }
});

// ---- Helper: Build status HTML page ----
function buildStatusPage(
    state: string,
    errorMsg: string | null,
    merchantOrderId: string,
    credits?: number,
    requestOrigin?: string
): string {
    // Use the origin from the request so ngrok/tunneled URLs work
    const frontendUrl = requestOrigin || env.FRONTEND_URL;

    let statusBlock = "";
    let autoRedirect = "";

    if (state === "COMPLETED") {
        statusBlock = `
            <div class="status-icon">✅</div>
            <h2>Payment Successful!</h2>
            <p class="credits-added">+${credits} Credits Added</p>
            <p class="sub">Order: ${merchantOrderId}</p>
            <p class="redirect-msg">Redirecting back to Scribble...</p>
        `;
        autoRedirect = `<script>setTimeout(() => { window.location.href = '${frontendUrl}/?credits=success'; }, 3000);</script>`;
    } else if (state === "FAILED") {
        statusBlock = `
            <div class="status-icon">❌</div>
            <h2>Payment Failed</h2>
            <p class="sub">${errorMsg || "Your payment could not be processed."}</p>
            <p class="sub">Order: ${merchantOrderId}</p>
            <a href="${frontendUrl}" class="btn-back">Back to Scribble</a>
        `;
    } else if (state === "PENDING") {
        statusBlock = `
            <div class="status-icon spinner">⏳</div>
            <h2>Processing Payment...</h2>
            <p class="sub">Please wait while we confirm your payment.</p>
            <p class="sub">This page will refresh automatically.</p>
        `;
        autoRedirect = `<script>setTimeout(() => { location.reload(); }, 5000);</script>`;
    } else {
        statusBlock = `
            <div class="status-icon">⚠️</div>
            <h2>Error</h2>
            <p class="sub">${errorMsg || "Something went wrong."}</p>
            <a href="${frontendUrl}" class="btn-back">Back to Scribble</a>
        `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Status — Scribble</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            background: #0f0f1a;
            color: #e2e8f0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .card {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px;
            padding: 48px;
            text-align: center;
            max-width: 420px;
            width: 100%;
            backdrop-filter: blur(16px);
        }
        .status-icon { font-size: 4rem; margin-bottom: 16px; }
        .spinner { animation: pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        h2 { font-size: 1.5rem; font-weight: 700; margin-bottom: 8px; }
        .credits-added {
            font-size: 1.8rem; font-weight: 800;
            color: #06d6a0; margin: 12px 0;
        }
        .sub { color: #94a3b8; font-size: 0.85rem; margin: 6px 0; }
        .redirect-msg { color: #7c3aed; font-size: 0.9rem; margin-top: 16px; }
        .btn-back {
            display: inline-block; margin-top: 20px;
            padding: 10px 24px; border-radius: 8px;
            background: #7c3aed; color: white; text-decoration: none;
            font-weight: 600; transition: background 0.2s;
        }
        .btn-back:hover { background: #6d28d9; }
    </style>
    ${autoRedirect}
</head>
<body>
    <div class="card">${statusBlock}</div>
</body>
</html>`;
}

export default router;
