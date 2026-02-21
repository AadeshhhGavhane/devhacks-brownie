// ============================================
// Scribble Clone — Bun HTTP + WebSocket + Express Server
// ============================================

import mongoose from "mongoose";
import { env } from "./config/env";
import { GAME_CONFIG } from "./types";
import type { Player } from "./types";
import { sockets, players, generateId, sendTo } from "./state";
import { leaveRoom } from "./room";
import { handleMessage } from "./handlers";
import { app } from "./app";
import { authenticateWs, type WsAuthData } from "./middleware/wsAuth";

// ───── Connect to MongoDB & Start Server ─────

async function start() {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(env.MONGODB_URI);
        console.log("✅ MongoDB connected");

        const server = Bun.serve<WsAuthData>({
            port: env.PORT,

            // ---- HTTP: check for WS upgrade first, then delegate to Express ----
            async fetch(req, server) {
                const url = new URL(req.url);

                // WebSocket upgrade — authenticate via cookie
                if (url.pathname === "/ws") {
                    const authData = await authenticateWs(req);
                    if (!authData) {
                        return new Response("Unauthorized", { status: 401 });
                    }

                    const socketId = generateId(8);
                    const success = server.upgrade(req, {
                        data: {
                            socketId,
                            authUserId: authData.authUserId,
                            email: authData.email,
                            username: authData.username,
                            avatar: authData.avatar,
                            location: authData.location,
                        },
                    });
                    if (success) return undefined;
                    return new Response("WebSocket upgrade failed", { status: 500 });
                }

                // Delegate all other HTTP requests to Express
                return handleExpressRequest(req);
            },

            // ---- WebSocket handlers ----
            websocket: {
                open(ws) {
                    const { socketId, authUserId, email, username, avatar, location } = ws.data;

                    // Register socket
                    sockets.set(socketId, ws);

                    // Create player record with authenticated identity
                    const player: Player = {
                        socketId,
                        authUserId,
                        email,
                        username,
                        avatar,
                        location,
                        roomId: null,
                        score: 0,
                        hasGuessed: false,
                        isDrawing: false,
                        canGuess: true,
                        lastGuessTime: 0,
                    };
                    players.set(socketId, player);

                    // Send connected event with user info
                    sendTo(socketId, {
                        type: "connected",
                        socketId,
                        username,
                        avatar,
                    });

                    console.log(`[+] Player connected: ${username} (${socketId}) [${players.size} online]`);
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

                        if (player.roomId) {
                            leaveRoom(socketId);
                        }

                        players.delete(socketId);
                    }

                    sockets.delete(socketId);
                    console.log(`    (${players.size} online)`);
                },
            },
        });

        console.log(`
╔══════════════════════════════════════════╗
║   🎨 Scribble Clone                     ║
║   Server running on port ${env.PORT}            ║
║   http://localhost:${env.PORT}                  ║
║   Auth + MFA + WebSocket Game            ║
╚══════════════════════════════════════════╝
`);
    } catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
}

// ───── Express ↔ Bun Adapter ─────
// Converts Bun's Request into a Node-style req/res for Express

function handleExpressRequest(req: Request): Promise<Response> {
    return new Promise((resolve) => {
        const url = new URL(req.url);

        // Build a mock IncomingMessage-like object
        const headers: Record<string, string> = {};
        req.headers.forEach((value, key) => {
            headers[key] = value;
        });

        // Read body for non-GET/HEAD
        const hasBody = req.method !== "GET" && req.method !== "HEAD";

        const handle = (bodyBuffer?: Buffer) => {
            // Create a minimal Node.js IncomingMessage-compatible object
            const { Readable, Duplex } = require("stream");
            const nodeReq = new Readable({
                read() {
                    if (bodyBuffer) {
                        this.push(bodyBuffer);
                    }
                    this.push(null);
                },
            });

            // Create a mock socket (Duplex stream) so Node internals can call destroy/end
            const mockSocket = new Duplex({
                read() {},
                write(_chunk: any, _encoding: any, cb: any) { cb(); },
            });
            mockSocket.remoteAddress = "127.0.0.1";
            mockSocket.encrypted = false;

            // Attach properties Express expects
            Object.assign(nodeReq, {
                method: req.method,
                url: url.pathname + url.search,
                headers,
                connection: mockSocket,
                socket: mockSocket,
            });

            // Create a mock ServerResponse
            const { ServerResponse } = require("http");
            const nodeRes = new ServerResponse(nodeReq);
            nodeRes.assignSocket(mockSocket);

            let responseBody: Buffer[] = [];
            const originalWrite = nodeRes.write.bind(nodeRes);
            const originalEnd = nodeRes.end.bind(nodeRes);

            nodeRes.write = (chunk: any, encoding?: any, cb?: any) => {
                if (chunk) {
                    responseBody.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, (typeof encoding === 'string' ? encoding : 'utf8') as BufferEncoding));
                }
                if (typeof encoding === 'function') encoding();
                else if (typeof cb === 'function') cb();
                return true;
            };

            nodeRes.end = (chunk?: any, encoding?: any, cb?: any) => {
                if (chunk) {
                    responseBody.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, (typeof encoding === 'string' ? encoding : 'utf8') as BufferEncoding));
                }

                const statusCode = nodeRes.statusCode || 200;
                const resHeaders = new Headers();

                // Extract headers from the mock response
                const rawHeaders = nodeRes.getHeaders();
                for (const [key, value] of Object.entries(rawHeaders)) {
                    if (value !== undefined) {
                        if (Array.isArray(value)) {
                            value.forEach((v: string) => resHeaders.append(key, v));
                        } else {
                            resHeaders.set(key, String(value));
                        }
                    }
                }

                resolve(new Response(
                    Buffer.concat(responseBody),
                    { status: statusCode, headers: resHeaders }
                ));

                if (typeof encoding === 'function') encoding();
                else if (typeof cb === 'function') cb();
            };

            // Let Express handle it
            app(nodeReq, nodeRes);
        };

        if (hasBody) {
            req.arrayBuffer().then((ab) => {
                handle(Buffer.from(ab));
            });
        } else {
            handle();
        }
    });
}

start();
