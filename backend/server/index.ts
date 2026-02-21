// ============================================
// Scribble Clone MVP — Bun HTTP + WebSocket Server
// ============================================

import { GAME_CONFIG } from "./types";
import type { Player } from "./types";
import { sockets, players, generateId, sendTo } from "./state";
import { leaveRoom } from "./room";
import { handleMessage } from "./handlers";
import { join, extname } from "path";
import { readFileSync, existsSync, statSync } from "fs";

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

const PUBLIC_DIR = join(import.meta.dir, "..", "public");

const server = Bun.serve({
    port: GAME_CONFIG.port,

    // ---- HTTP: serve static files ----
    fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade
        if (url.pathname === "/ws") {
            const socketId = generateId(8);
            const success = server.upgrade(req, { data: { socketId } });
            if (success) return undefined;
            return new Response("WebSocket upgrade failed", { status: 500 });
        }

        // Serve static files from public/
        let filePath = join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);

        // Security: prevent directory traversal
        if (!filePath.startsWith(PUBLIC_DIR)) {
            return new Response("Forbidden", { status: 403 });
        }

        // If path is a directory, look for index.html
        try {
            if (existsSync(filePath) && statSync(filePath).isDirectory()) {
                filePath = join(filePath, "index.html");
            }
        } catch {
            // ignore
        }

        try {
            if (existsSync(filePath)) {
                const ext = extname(filePath);
                const contentType = MIME_TYPES[ext] || "application/octet-stream";
                const fileContent = readFileSync(filePath);
                return new Response(fileContent, {
                    headers: { "Content-Type": contentType },
                });
            }
        } catch {
            // fall through
        }

        return new Response("Not Found", { status: 404 });
    },

    // ---- WebSocket handlers ----
    websocket: {
        open(ws) {
            const socketId = ws.data.socketId;

            // Register socket
            sockets.set(socketId, ws);

            // Create player record
            const player: Player = {
                socketId,
                userId: generateId(12),
                username: "",
                roomId: null,
                score: 0,
                hasGuessed: false,
                isDrawing: false,
                canGuess: true,
                lastGuessTime: 0,
            };
            players.set(socketId, player);

            // Send connected event
            sendTo(socketId, { type: "connected", socketId });

            console.log(`[+] Player connected: ${socketId} (${players.size} online)`);
        },

        message(ws, message) {
            const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
            handleMessage(ws, raw);
        },

        close(ws) {
            const socketId = ws.data.socketId;
            const player = players.get(socketId);

            if (player) {
                console.log(`[-] Player disconnected: ${player.username || socketId}`);

                // Handle room cleanup
                if (player.roomId) {
                    leaveRoom(socketId);
                }

                // Remove player
                players.delete(socketId);
            }

            sockets.delete(socketId);
            console.log(`    (${players.size} online)`);
        },
    },
});

console.log(`
╔══════════════════════════════════════════╗
║   🎨 Scribble Clone MVP                 ║
║   Server running on port ${GAME_CONFIG.port}            ║
║   http://localhost:${GAME_CONFIG.port}                  ║
╚══════════════════════════════════════════╝
`);
