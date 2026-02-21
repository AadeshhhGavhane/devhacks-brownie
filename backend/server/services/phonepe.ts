// ============================================
// Scribble Clone — PhonePe Payment Service
// Encapsulates PhonePe v2 PG API calls
// ============================================

import axios from "axios";
import crypto from "crypto";
import { env } from "../config/env";

// ---- Token Cache ----
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Get an OAuth2 access token (client_credentials flow).
 * Caches the token in-memory for 15 minutes.
 */
export async function getAccessToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt) {
        return cachedToken;
    }

    const response = await axios.post(
        `${env.PHONEPE_BASE_URL}/v1/oauth/token`,
        new URLSearchParams({
            client_id: env.PHONEPE_CLIENT_ID,
            client_secret: env.PHONEPE_CLIENT_SECRET,
            client_version: env.PHONEPE_CLIENT_VERSION,
            grant_type: "client_credentials",
        }),
        {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
    );

    cachedToken = response.data.access_token;
    // Cache for 15 minutes (PhonePe tokens typically last ~20min)
    tokenExpiresAt = now + 15 * 60 * 1000;
    return cachedToken!;
}

/**
 * Initiate a PhonePe PG Checkout payment.
 * Returns the redirect URL the user should be sent to.
 */
export async function initiatePayment(
    merchantOrderId: string,
    amountPaise: number,
    redirectUrl: string
): Promise<string> {
    const accessToken = await getAccessToken();

    const payload = {
        merchantOrderId,
        amount: amountPaise,
        paymentFlow: {
            type: "PG_CHECKOUT",
            message: `Scribble Credits — Order ${merchantOrderId}`,
            merchantUrls: {
                redirectUrl,
            },
        },
    };

    const response = await axios.post(
        `${env.PHONEPE_BASE_URL}/checkout/v2/pay`,
        payload,
        {
            headers: {
                Authorization: `O-Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        }
    );

    return response.data.redirectUrl;
}

/**
 * Check payment status for a given merchantOrderId.
 * Returns the parsed PhonePe status response.
 */
export interface PhonePeStatus {
    state: "COMPLETED" | "FAILED" | "PENDING" | string;
    orderId: string | null;
    amount: number | null;
    transactionId: string | null;
}

export async function checkStatus(merchantOrderId: string): Promise<PhonePeStatus> {
    const accessToken = await getAccessToken();

    const response = await axios.get(
        `${env.PHONEPE_BASE_URL}/checkout/v2/order/${merchantOrderId}/status`,
        {
            headers: {
                Authorization: `O-Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        }
    );

    const data = response.data;
    const paymentDetails = data.paymentDetails || [];

    return {
        state: data.state || "UNKNOWN",
        orderId: data.orderId || null,
        amount: data.amount || null,
        transactionId: paymentDetails.length > 0 ? paymentDetails[0].transactionId : null,
    };
}

/**
 * Verify PhonePe webhook Authorization header.
 * PhonePe sends SHA-256(username:password) as the auth header.
 */
export function verifyWebhookAuth(authHeader: string | undefined): boolean {
    if (!authHeader) return false;

    const expectedHash = crypto
        .createHash("sha256")
        .update(`${env.PHONEPE_WEBHOOK_USERNAME}:${env.PHONEPE_WEBHOOK_PASSWORD}`)
        .digest("hex");

    return authHeader === expectedHash;
}
