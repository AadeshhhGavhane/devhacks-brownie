// ============================================
// Scribble Clone — Auth Routes
// ============================================

import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User";
import { Session } from "../models/Session";
import {
    signAccessToken,
    signTempMfaToken,
    verifyTempMfaToken,
    generateRefreshToken,
    hashRefreshToken,
} from "../utils/tokens";
import { decryptSecret } from "../utils/crypto";
import { extractDevice } from "../utils/device";
import { authenticate } from "../middleware/authenticate";
import { createOtp, verifyOtp } from "../utils/otp";
import { sendOtpEmail } from "../utils/email";
import speakeasy from "speakeasy";

const router = Router();

// ───── Validation Schemas ─────

const registerSchema = z.object({
    email: z.string().email("Invalid email address"),
    username: z
        .string()
        .min(3, "Username must be at least 3 characters")
        .max(20, "Username must be at most 20 characters")
        .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores")
        .transform((v) => v.toLowerCase()),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128, "Password is too long"),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, "Password is required"),
});

const mfaLoginSchema = z.object({
    tempToken: z.string().min(1),
    otp: z.string().length(6, "OTP must be 6 digits"),
});

const verifyEmailSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6, "OTP must be 6 digits"),
});

const forgotPasswordSchema = z.object({
    email: z.string().email(),
});

const resetPasswordSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6, "OTP must be 6 digits"),
    newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128, "Password is too long"),
});

const resendVerificationSchema = z.object({
    email: z.string().email(),
});

// ───── Cookie Config ─────

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
};

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie("accessToken", accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.cookie("refreshToken", refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/auth/refresh",
    });
}

function clearAuthCookies(res: Response) {
    res.clearCookie("accessToken", COOKIE_OPTIONS);
    res.clearCookie("refreshToken", { ...COOKIE_OPTIONS, path: "/auth/refresh" });
}

// ───── Helper: Create session + issue tokens ─────

async function createSessionAndIssueTokens(
    userId: string,
    req: Request,
    res: Response
) {
    const device = extractDevice(req);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const session = await Session.create({
        userId,
        device,
        refreshTokenHash,
    });

    const accessToken = signAccessToken(userId, session._id.toString());
    setAuthCookies(res, accessToken, refreshToken);

    return session;
}

// ───── POST /auth/register ─────

router.post("/register", async (req: Request, res: Response) => {
    try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.flatten().fieldErrors,
            });
            return;
        }

        const { email, username, password } = parsed.data;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            res.status(409).json({ error: "Email already registered" });
            return;
        }

        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            res.status(409).json({ error: "Username is already taken" });
            return;
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await User.create({ email, username, passwordHash, emailVerified: false, credits: 500 });

        const otpCode = await createOtp(user._id.toString(), "email-verify");
        await sendOtpEmail(email, otpCode, "email-verify");

        res.status(201).json({
            message: "Account created. Please check your email for a verification code.",
            email: user.email,
            requiresVerification: true,
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── POST /auth/verify-email ─────

router.post("/verify-email", async (req: Request, res: Response) => {
    try {
        const parsed = verifyEmailSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.flatten().fieldErrors,
            });
            return;
        }

        const { email, otp } = parsed.data;

        const user = await User.findOne({ email });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (user.emailVerified) {
            res.status(400).json({ error: "Email is already verified" });
            return;
        }

        const isValid = await verifyOtp(user._id.toString(), "email-verify", otp);
        if (!isValid) {
            res.status(401).json({ error: "Invalid or expired OTP" });
            return;
        }

        user.emailVerified = true;
        await user.save();

        res.json({ message: "Email verified successfully. You can now sign in." });
    } catch (error) {
        console.error("Verify email error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── POST /auth/resend-verification ─────

router.post("/resend-verification", async (req: Request, res: Response) => {
    try {
        const parsed = resendVerificationSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.flatten().fieldErrors,
            });
            return;
        }

        const { email } = parsed.data;

        const user = await User.findOne({ email });
        if (!user) {
            res.json({ message: "If the email is registered, a verification code has been sent." });
            return;
        }

        if (user.emailVerified) {
            res.status(400).json({ error: "Email is already verified" });
            return;
        }

        const otpCode = await createOtp(user._id.toString(), "email-verify");
        await sendOtpEmail(email, otpCode, "email-verify");

        res.json({ message: "If the email is registered, a verification code has been sent." });
    } catch (error) {
        console.error("Resend verification error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── POST /auth/login ─────

router.post("/login", async (req: Request, res: Response) => {
    try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.flatten().fieldErrors,
            });
            return;
        }

        const { email, password } = parsed.data;

        const user = await User.findOne({ email });
        if (!user) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        if (!user.emailVerified) {
            res.status(403).json({
                error: "Please verify your email first",
                code: "EMAIL_NOT_VERIFIED",
                email: user.email,
            });
            return;
        }

        if (user.mfaEnabled) {
            const tempToken = signTempMfaToken(user._id.toString());
            res.json({
                mfaRequired: true,
                tempToken,
                message: "MFA verification required",
            });
            return;
        }

        const session = await createSessionAndIssueTokens(
            user._id.toString(),
            req,
            res
        );

        res.json({
            mfaRequired: false,
            message: "Login successful",
            user: user.toJSON(),
            session: {
                id: session._id,
                device: session.device,
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── POST /auth/login/mfa ─────

router.post("/login/mfa", async (req: Request, res: Response) => {
    try {
        const parsed = mfaLoginSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.flatten().fieldErrors,
            });
            return;
        }

        const { tempToken, otp } = parsed.data;

        let payload;
        try {
            payload = verifyTempMfaToken(tempToken);
        } catch {
            res.status(401).json({ error: "Invalid or expired MFA token" });
            return;
        }

        const user = await User.findById(payload.sub);
        if (!user || !user.mfaEnabled || !user.mfaSecret) {
            res.status(401).json({ error: "MFA not configured" });
            return;
        }

        const decryptedSecret = decryptSecret(user.mfaSecret);
        const isValid = speakeasy.totp.verify({
            secret: decryptedSecret,
            encoding: "base32",
            token: otp,
            window: 2,
        });

        if (!isValid) {
            res.status(401).json({ error: "Invalid OTP" });
            return;
        }

        const session = await createSessionAndIssueTokens(
            user._id.toString(),
            req,
            res
        );

        res.json({
            message: "Login successful",
            user: user.toJSON(),
            session: {
                id: session._id,
                device: session.device,
            },
        });
    } catch (error) {
        console.error("MFA login error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── POST /auth/forgot-password ─────

router.post("/forgot-password", async (req: Request, res: Response) => {
    try {
        const parsed = forgotPasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.flatten().fieldErrors,
            });
            return;
        }

        const { email } = parsed.data;

        const user = await User.findOne({ email });
        if (user) {
            const otpCode = await createOtp(user._id.toString(), "forgot-password");
            await sendOtpEmail(email, otpCode, "forgot-password");
        }

        res.json({
            message: "If an account exists with that email, a reset code has been sent.",
        });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── POST /auth/reset-password ─────

router.post("/reset-password", async (req: Request, res: Response) => {
    try {
        const parsed = resetPasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.flatten().fieldErrors,
            });
            return;
        }

        const { email, otp, newPassword } = parsed.data;

        const user = await User.findOne({ email });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const isValid = await verifyOtp(user._id.toString(), "forgot-password", otp);
        if (!isValid) {
            res.status(401).json({ error: "Invalid or expired OTP" });
            return;
        }

        user.passwordHash = await bcrypt.hash(newPassword, 12);
        await user.save();

        await Session.updateMany(
            { userId: user._id, revoked: false },
            { revoked: true }
        );

        res.json({
            message: "Password reset successful. All sessions have been logged out. Please sign in with your new password.",
        });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── POST /auth/refresh ─────

router.post("/refresh", async (req: Request, res: Response) => {
    try {
        const oldRefreshToken = req.cookies?.refreshToken;
        if (!oldRefreshToken) {
            res.status(401).json({ error: "No refresh token" });
            return;
        }

        const oldHash = hashRefreshToken(oldRefreshToken);

        const session = await Session.findOne({
            refreshTokenHash: oldHash,
            revoked: false,
        });

        if (!session) {
            res.status(401).json({ error: "Invalid or revoked refresh token" });
            return;
        }

        const newRefreshToken = generateRefreshToken();
        session.refreshTokenHash = hashRefreshToken(newRefreshToken);
        session.lastActiveAt = new Date();
        await session.save();

        const accessToken = signAccessToken(
            session.userId.toString(),
            session._id.toString()
        );

        setAuthCookies(res, accessToken, newRefreshToken);

        res.json({ message: "Token refreshed" });
    } catch (error) {
        console.error("Refresh error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── GET /auth/check-username/:username ─────

router.get("/check-username/:username", async (req: Request, res: Response) => {
    try {
        const raw = (req.params.username as string)?.toLowerCase().trim();
        if (!raw || raw.length < 3 || raw.length > 20 || !/^[a-z0-9_]+$/.test(raw)) {
            res.json({ available: false, reason: "Invalid format (3-20 chars, lowercase letters, numbers, underscores)" });
            return;
        }

        const existing = await User.findOne({ username: raw });
        res.json({ available: !existing });
    } catch (error) {
        console.error("Check username error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── POST /auth/logout ─────

router.post("/logout", authenticate, async (req: Request, res: Response) => {
    try {
        await Session.findByIdAndUpdate(req.sessionId, { revoked: true });
        clearAuthCookies(res);
        res.json({ message: "Logged out successfully" });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
