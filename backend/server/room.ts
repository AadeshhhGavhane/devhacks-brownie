// ============================================
// Scribble Clone MVP — Room Management
// ============================================

import type { Player, Room, ServerMessage } from "./types";
import { GAME_CONFIG } from "./types";
import {
    rooms, players, getPlayer, getRoom, getPlayersInRoom,
    broadcastToRoom, sendTo, generateId, toPlayerInfo,
} from "./state";
import { endRoundEarly, handleDrawerDisconnect } from "./game";

// ---- Create Room ----

export function createRoom(socketId: string): void {
    const player = getPlayer(socketId);
    if (!player) return;

    if (player.roomId) {
        sendTo(socketId, { type: "room_error", message: "You are already in a room" });
        return;
    }

    let roomId = generateId();
    while (rooms.has(roomId)) {
        roomId = generateId();
    }

    const room: Room = {
        roomId,
        hostId: socketId,
        players: [socketId],
        currentRound: 0,
        totalRounds: GAME_CONFIG.totalRounds,
        currentDrawerIndex: -1,
        word: null,
        phase: "waiting",
        timer: null,
        timerInterval: null,
        timeLeft: 0,
        maxPlayers: GAME_CONFIG.maxPlayers,
        drawOrder: [],
        roundDrawnCount: 0,
    };

    rooms.set(roomId, room);
    player.roomId = roomId;

    sendTo(socketId, { type: "room_created", roomId });
    sendTo(socketId, {
        type: "room_joined",
        roomId,
        players: [toPlayerInfo(player, room)],
    });
}

// ---- Join Room ----

export function joinRoom(socketId: string, roomId: string): void {
    const player = getPlayer(socketId);
    if (!player) return;

    if (player.roomId) {
        sendTo(socketId, { type: "room_error", message: "You are already in a room" });
        return;
    }

    const normalizedId = roomId.toUpperCase().trim();
    const room = getRoom(normalizedId);

    if (!room) {
        sendTo(socketId, { type: "room_error", message: "Room not found" });
        return;
    }

    if (room.players.length >= room.maxPlayers) {
        sendTo(socketId, { type: "room_error", message: "Room is full" });
        return;
    }

    if (room.phase === "game_end") {
        sendTo(socketId, { type: "room_error", message: "Game has already ended" });
        return;
    }

    // Late join — can see game but can't guess until next round
    const isLateJoin = room.phase !== "waiting";
    player.roomId = normalizedId;
    player.canGuess = !isLateJoin;
    room.players.push(socketId);

    // Notify existing players
    broadcastToRoom(normalizedId, {
        type: "player_joined",
        player: toPlayerInfo(player, room),
    }, socketId);

    // Send room state to the joining player
    const playersInRoom = getPlayersInRoom(normalizedId);
    sendTo(socketId, {
        type: "room_joined",
        roomId: normalizedId,
        players: playersInRoom.map((p) => toPlayerInfo(p, room)),
    });

    if (isLateJoin) {
        sendTo(socketId, {
            type: "chat_message",
            player: "System",
            text: "You joined mid-game. You can guess starting next round.",
            isSystem: true,
        });
    }
}

// ---- Leave Room ----

export function leaveRoom(socketId: string): void {
    const player = getPlayer(socketId);
    if (!player || !player.roomId) return;

    const roomId = player.roomId;
    const room = getRoom(roomId);
    if (!room) {
        player.roomId = null;
        return;
    }

    const wasDrawing = player.isDrawing;
    const username = player.username;

    // Remove player from room
    room.players = room.players.filter((id) => id !== socketId);
    room.drawOrder = room.drawOrder.filter((id) => id !== socketId);

    // Reset player state
    player.roomId = null;
    player.score = 0;
    player.hasGuessed = false;
    player.isDrawing = false;
    player.canGuess = true;

    // If room is empty, clean up
    if (room.players.length === 0) {
        clearRoomTimers(room);
        rooms.delete(roomId);
        return;
    }

    // Host migration
    let newHost: string | undefined;
    if (room.hostId === socketId) {
        room.hostId = room.players[0]!;
        newHost = getPlayer(room.players[0]!)?.username;
    }

    // Notify remaining players
    broadcastToRoom(roomId, {
        type: "player_left",
        player: { socketId, username, score: 0, isHost: false, isDrawing: false, hasGuessed: false, canGuess: true, avatar: null, location: null },
        newHost,
    });

    if (newHost) {
        broadcastToRoom(roomId, {
            type: "chat_message",
            player: "System",
            text: `${newHost} is now the host.`,
            isSystem: true,
        });
    }

    // If the drawer left during an active game, handle it
    if (wasDrawing && (room.phase === "drawing" || room.phase === "picking")) {
        handleDrawerDisconnect(room);
    } else if (room.phase === "drawing") {
        // Check if all remaining guessers have guessed — end round early
        checkAllGuessed(room);
    }

    // If too few players to continue
    if (room.players.length < GAME_CONFIG.minPlayers && room.phase !== "waiting" && room.phase !== "game_end") {
        clearRoomTimers(room);
        room.phase = "waiting";
        room.currentRound = 0;
        broadcastToRoom(roomId, {
            type: "chat_message",
            player: "System",
            text: "Not enough players to continue. Game paused.",
            isSystem: true,
        });
        // Send updated player list
        const remainingPlayers = getPlayersInRoom(roomId);
        broadcastToRoom(roomId, {
            type: "player_list",
            players: remainingPlayers.map((p) => toPlayerInfo(p, room)),
        });
    }
}

function checkAllGuessed(room: Room): void {
    const playersInRoom = getPlayersInRoom(room.roomId);
    const guessers = playersInRoom.filter((p) => !p.isDrawing && p.canGuess);
    const allGuessed = guessers.length > 0 && guessers.every((p) => p.hasGuessed);
    if (allGuessed) {
        endRoundEarly(room);
    }
}

export function clearRoomTimers(room: Room): void {
    if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
    }
    if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
    }
}
