// ============================================
// Scribble Clone — Location / Geocoding Routes
// ============================================

import { Router, type Request, type Response } from "express";
import { authenticate } from "../middleware/authenticate";
import { User } from "../models/User";
import { env } from "../config/env";

const router = Router();

// All location routes require authentication
router.use(authenticate);

const GEOAPIFY_BASE = "https://api.geoapify.com/v1/geocode";

// ───── GET /location/autocomplete?text=... ─────
// Proxies to Geoapify autocomplete (global, no country filter)

router.get("/autocomplete", async (req: Request, res: Response) => {
    try {
        const text = (req.query.text as string || "").trim();
        if (!text || text.length < 2) {
            res.json({ features: [] });
            return;
        }

        const url = `${GEOAPIFY_BASE}/autocomplete?text=${encodeURIComponent(text)}&apiKey=${env.GEOAPIFY_KEY}&limit=5&format=json`;

        const response = await fetch(url);
        if (!response.ok) {
            console.error("Geoapify autocomplete error:", response.status);
            res.status(502).json({ error: "Geocoding service error" });
            return;
        }

        const data: any = await response.json();
        const results = (data.results || []).map((r: any) => ({
            formatted: r.formatted,
            lat: r.lat,
            lon: r.lon,
            city: r.city || r.county || null,
            country: r.country || null,
        }));

        res.json({ results });
    } catch (error) {
        console.error("Autocomplete proxy error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── GET /location/reverse?lat=...&lon=... ─────
// Proxies to Geoapify reverse geocoding

router.get("/reverse", async (req: Request, res: Response) => {
    try {
        const lat = parseFloat(req.query.lat as string);
        const lon = parseFloat(req.query.lon as string);

        if (isNaN(lat) || isNaN(lon)) {
            res.status(400).json({ error: "Valid lat and lon query params required" });
            return;
        }

        const url = `${GEOAPIFY_BASE}/reverse?lat=${lat}&lon=${lon}&apiKey=${env.GEOAPIFY_KEY}&format=json`;

        const response = await fetch(url);
        if (!response.ok) {
            console.error("Geoapify reverse error:", response.status);
            res.status(502).json({ error: "Geocoding service error" });
            return;
        }

        const data: any = await response.json();
        const result = data.results?.[0];

        if (!result) {
            res.json({ location: null });
            return;
        }

        res.json({
            location: {
                formatted: result.formatted,
                lat: result.lat,
                lon: result.lon,
                city: result.city || result.county || null,
                country: result.country || null,
            },
        });
    } catch (error) {
        console.error("Reverse geocode proxy error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ───── GET /location/players ─────
// Returns all users who have a non-null location (for the nearby map)

router.get("/players", async (req: Request, res: Response) => {
    try {
        const users = await User.find(
            { location: { $ne: null } },
            { username: 1, avatar: 1, location: 1, _id: 0 }
        ).lean();

        res.json({ players: users });
    } catch (error) {
        console.error("Location players error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
