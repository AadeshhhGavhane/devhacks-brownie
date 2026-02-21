// ============================================
// Scribble Clone MVP — In-Memory State
// ============================================

import type { Player, Room, PlayerInfo } from "./types";
import type { ServerWebSocket } from "bun";

// All connected players, keyed by WebSocket instance
export const sockets = new Map<string, ServerWebSocket<{ socketId: string }>>();
export const players = new Map<string, Player>();
export const rooms = new Map<string, Room>();

// ---- Helpers ----

export function getPlayer(socketId: string): Player | undefined {
    return players.get(socketId);
}

export function getRoom(roomId: string): Room | undefined {
    return rooms.get(roomId);
}

export function getSocket(socketId: string): ServerWebSocket<{ socketId: string }> | undefined {
    return sockets.get(socketId);
}

export function getPlayersInRoom(roomId: string): Player[] {
    const room = rooms.get(roomId);
    if (!room) return [];
    return room.players
        .map((id) => players.get(id))
        .filter((p): p is Player => p !== undefined);
}

export function toPlayerInfo(player: Player, room: Room): PlayerInfo {
    return {
        socketId: player.socketId,
        username: player.username,
        score: player.score,
        isHost: room.hostId === player.socketId,
        isDrawing: player.isDrawing,
        hasGuessed: player.hasGuessed,
        canGuess: player.canGuess,
    };
}

export function broadcastToRoom(roomId: string, message: object, excludeSocketId?: string) {
    const room = rooms.get(roomId);
    if (!room) return;

    const msg = JSON.stringify(message);
    for (const socketId of room.players) {
        if (socketId === excludeSocketId) continue;
        const ws = sockets.get(socketId);
        if (ws) {
            try {
                ws.send(msg);
            } catch {
                // socket may have closed
            }
        }
    }
}

export function sendTo(socketId: string, message: object) {
    const ws = sockets.get(socketId);
    if (ws) {
        try {
            ws.send(JSON.stringify(message));
        } catch {
            // socket may have closed
        }
    }
}

export function generateId(length = 6): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}
