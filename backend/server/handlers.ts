// ============================================
// Scribble Clone MVP — WebSocket Message Router
// ============================================

import type { ClientMessage } from "./types";
import type { ServerWebSocket } from "bun";
import { getPlayer, getRoom, broadcastToRoom } from "./state";
import { createRoom, joinRoom, leaveRoom } from "./room";
import { startGame, selectWord, handleGuess, handlePlayAgain } from "./game";

export function handleMessage(
    ws: ServerWebSocket<{ socketId: string }>,
    raw: string
): void {
    const socketId = ws.data.socketId;

    let msg: ClientMessage;
    try {
        msg = JSON.parse(raw);
    } catch {
        return;
    }

    switch (msg.type) {
        case "set_username":
            handleSetUsername(socketId, msg.username);
            break;

        case "create_room":
            createRoom(socketId);
            break;

        case "join_room":
            joinRoom(socketId, msg.roomId);
            break;

        case "leave_room":
            leaveRoom(socketId);
            break;

        case "start_game": {
            const player = getPlayer(socketId);
            if (!player?.roomId) return;
            const room = getRoom(player.roomId);
            if (!room) return;
            startGame(socketId, room);
            break;
        }

        case "select_word": {
            const player = getPlayer(socketId);
            if (!player?.roomId) return;
            const room = getRoom(player.roomId);
            if (!room) return;
            selectWord(socketId, room, msg.word);
            break;
        }

        case "draw": {
            const player = getPlayer(socketId);
            if (!player?.roomId || !player.isDrawing) return;
            // Broadcast draw data to everyone in the room except the drawer
            broadcastToRoom(player.roomId, {
                type: "draw",
                x: msg.x,
                y: msg.y,
                color: msg.color,
                strokeWidth: msg.strokeWidth,
                drawType: msg.drawType,
            }, socketId);
            break;
        }

        case "clear_canvas": {
            const player = getPlayer(socketId);
            if (!player?.roomId || !player.isDrawing) return;
            broadcastToRoom(player.roomId, { type: "clear_canvas" }, socketId);
            break;
        }

        case "guess": {
            const player = getPlayer(socketId);
            if (!player?.roomId) return;
            const room = getRoom(player.roomId);
            if (!room) return;
            handleGuess(socketId, room, msg.text);
            break;
        }

        case "play_again": {
            const player = getPlayer(socketId);
            if (!player?.roomId) return;
            const room = getRoom(player.roomId);
            if (!room) return;
            handlePlayAgain(socketId, room);
            break;
        }
    }
}

// ---- Set Username ----

import { players, sockets, sendTo } from "./state";

function handleSetUsername(socketId: string, username: string): void {
    const trimmed = username.trim();

    if (!trimmed || trimmed.length < 2 || trimmed.length > 16) {
        sendTo(socketId, {
            type: "username_set",
            success: false,
            error: "Username must be 2-16 characters",
        });
        return;
    }

    // Check for alphanumeric + spaces only
    if (!/^[a-zA-Z0-9_ ]+$/.test(trimmed)) {
        sendTo(socketId, {
            type: "username_set",
            success: false,
            error: "Username can only contain letters, numbers, spaces, and underscores",
        });
        return;
    }

    const player = getPlayer(socketId);
    if (!player) return;

    player.username = trimmed;

    sendTo(socketId, { type: "username_set", success: true });
}
