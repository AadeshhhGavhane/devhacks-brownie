// ============================================
// Scribble Clone — Profile Routes
// ============================================

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { User } from "../models/User";
import { GameHistory } from "../models/GameHistory";
import { authenticate } from "../middleware/authenticate";
import { uploadAvatar, deleteAvatar } from "../utils/cloudinary";

const router = Router();

// All profile routes require authentication
router.use(authenticate);

// ───── Multer Config ─────

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed"));
        }
    },
});

// ───── Validation ─────

const INDIA_PHONE_REGEX = /^(\+91|91)?[6-9]\d{9}$/;

function normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[\s\-\.]/g, "");
    const digits = cleaned.replace(/^(\+91|91)/, "");
    return `+91${digits}`;
}

const profileSchema = z.object({
    username: z
        .string()
        .min(3, "Username must be at least 3 characters")
        .max(20, "Username must be at most 20 characters")
        .regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, and underscores")
        .transform((v) => v.toLowerCase())
        .optional(),
    firstName: z.string().max(50).trim().optional().nullable(),
    lastName: z.string().max(50).trim().optional().nullable(),
    phone: z
        .string()
        .regex(INDIA_PHONE_REGEX, "Invalid Indian phone number (must start with 6-9, 10 digits)")
        .transform(normalizePhone)
        .optional()
        .nullable(),
    location: z
        .object({
            lat: z.number(),
            lon: z.number(),
            name: z.string().min(1).max(200),
        })
        .nullable()
        .optional(),
});

// ───── PATCH /profile ─────

router.patch("/", async (req: Request, res: Response) => {
    try {
        const parsed = profileSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.flatten().fieldErrors,
            });
            return;
        }

        const user = await User.findById(req.userId);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const { username, firstName, lastName, phone, location } = parsed.data;

        if (username !== undefined && username !== user.username) {
            const existing = await User.findOne({ username });
            if (existing) {
                res.status(409).json({ error: "Username is already taken" });
                return;
            }
            user.username = username;
        }

        if (firstName !== undefined) user.firstName = firstName;
        if (lastName !== undefined) user.lastName = lastName;
        if (phone !== undefined) user.phone = phone;
        if (location !== undefined) user.location = location;

        await user.save();

        res.json({
            message: "Profile updated",
            user: user.toJSON(),
        });
    } catch (error) {
        console.error("Profile update error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── POST /profile/avatar ─────

router.post("/avatar", upload.single("avatar"), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "No image file provided" });
            return;
        }

        const user = await User.findById(req.userId);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (user.avatarPublicId) {
            await deleteAvatar(user.avatarPublicId).catch(() => {});
        }

        const result = await uploadAvatar(req.file.buffer, user._id.toString());

        user.avatar = result.url;
        user.avatarPublicId = result.publicId;
        await user.save();

        res.json({
            message: "Avatar uploaded",
            avatar: result.url,
        });
    } catch (error: any) {
        if (error.message === "Only image files are allowed") {
            res.status(400).json({ error: error.message });
            return;
        }
        console.error("Avatar upload error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── DELETE /profile/avatar ─────

router.delete("/avatar", async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (!user.avatar) {
            res.status(400).json({ error: "No avatar to remove" });
            return;
        }

        if (user.avatarPublicId) {
            await deleteAvatar(user.avatarPublicId).catch(() => {});
        }

        user.avatar = null;
        user.avatarPublicId = null;
        await user.save();

        res.json({ message: "Avatar removed" });
    } catch (error) {
        console.error("Avatar delete error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── GET /profile/history ─────

router.get("/history", async (req: Request, res: Response) => {
    try {
        const games = await GameHistory.find({
            "players.userId": req.userId,
        })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        res.json({ games });
    } catch (error) {
        console.error("Game history error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
