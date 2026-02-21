// ============================================
// Scribble Clone — Express App (used by Bun.serve)
// ============================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import authRoutes from "./routes/auth";
import mfaRoutes from "./routes/mfa";
import profileRoutes from "./routes/profile";
import locationRoutes from "./routes/location";
import { meRouter, sessionsRouter } from "./routes/sessions";
import { join } from "path";

const app = express();

// ───── Middleware ─────

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.tile.openstreetmap.org", "https://maps.geoapify.com"],
            connectSrc: ["'self'"],
        },
    },
}));

app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.set("trust proxy", 1);

// ───── API Routes ─────

app.use("/auth", authRoutes);
app.use("/mfa", mfaRoutes);
app.use("/profile", profileRoutes);
app.use("/location", locationRoutes);
app.use("/me", meRouter);
app.use("/sessions", sessionsRouter);

// ───── Static Files ─────

const PUBLIC_DIR = join(import.meta.dir, "..", "public");
app.use(express.static(PUBLIC_DIR));

// SPA fallback — serve index.html for any non-API route
app.get("*", (req, res) => {
    const apiPrefixes = ["/auth", "/mfa", "/profile", "/location", "/sessions", "/me", "/ws"];
    if (apiPrefixes.some((p) => req.path.startsWith(p))) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.sendFile(join(PUBLIC_DIR, "index.html"));
});

export { app, PUBLIC_DIR };
