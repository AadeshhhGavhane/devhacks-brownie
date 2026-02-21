// ============================================
// Scribble Clone — WebSocket Authentication
// Verifies JWT from cookie on WS upgrade request
// ============================================

import { verifyAccessToken } from "../utils/tokens";
import { Session } from "../models/Session";
import { User } from "../models/User";

export interface WsAuthData {
    socketId: string;
    authUserId: string;
    email: string;
    username: string;
    avatar: string | null;
    location: { lat: number; lon: number; name: string } | null;
}

/**
 * Parse cookies from the raw Cookie header string
 */
function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((cookie) => {
        const [name, ...rest] = cookie.trim().split("=");
        if (name) {
            cookies[name.trim()] = decodeURIComponent(rest.join("=").trim());
        }
    });
    return cookies;
}

/**
 * Authenticate a WebSocket upgrade request.
 * Returns auth data if valid, null if not authenticated.
 */
export async function authenticateWs(req: Request): Promise<Omit<WsAuthData, "socketId"> | null> {
    try {
        const cookieHeader = req.headers.get("cookie");
        if (!cookieHeader) return null;

        const cookies = parseCookies(cookieHeader);
        const token = cookies["accessToken"];
        if (!token) return null;

        // Verify JWT
        const payload = verifyAccessToken(token);

        // Verify session is still active
        const session = await Session.findById(payload.sid);
        if (!session || session.revoked) return null;
        if (session.userId.toString() !== payload.sub) return null;

        // Look up the user
        const user = await User.findById(payload.sub);
        if (!user) return null;

        // Update session last active
        session.lastActiveAt = new Date();
        session.save().catch(() => {});

        return {
            authUserId: user._id.toString(),
            email: user.email,
            username: user.username,
            avatar: user.avatar,
            location: user.location || null,
        };
    } catch {
        return null;
    }
}
