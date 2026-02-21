// ============================================
// Scribble Clone — WebSocket Message Router
// ============================================

import type { ClientMessage } from "./types";
import type { ServerWebSocket } from "bun";
import type { WsAuthData } from "./middleware/wsAuth";
import { getPlayer, getRoom, broadcastToRoom, sendTo } from "./state";
import { createRoom, joinRoom, leaveRoom } from "./room";
import { startGame, selectWord, handleGuess, handlePlayAgain } from "./game";

export async function handleMessage(
    ws: ServerWebSocket<WsAuthData>,
    raw: string
): Promise<void> {
    const socketId = ws.data.socketId;

    let msg: ClientMessage;
    try {
        msg = JSON.parse(raw);
    } catch {
        return;
    }

    switch (msg.type) {
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
            await startGame(socketId, room);
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
            await handlePlayAgain(socketId, room);
            break;
        }
    }
}
