// ============================================
// Scribble Clone MVP — Game Engine
// ============================================

import type { Room, LeaderboardEntry } from "./types";
import { GAME_CONFIG } from "./types";
import {
    getPlayer, getPlayersInRoom, broadcastToRoom, sendTo, toPlayerInfo,
} from "./state";
import { clearRoomTimers } from "./room";
import words from "./words.json";

// ---- Start Game ----

export function startGame(socketId: string, room: Room): void {
    if (room.hostId !== socketId) {
        sendTo(socketId, { type: "room_error", message: "Only the host can start the game" });
        return;
    }

    if (room.players.length < GAME_CONFIG.minPlayers) {
        sendTo(socketId, { type: "room_error", message: `Need at least ${GAME_CONFIG.minPlayers} players` });
        return;
    }

    if (room.phase !== "waiting") {
        sendTo(socketId, { type: "room_error", message: "Game already in progress" });
        return;
    }

    // Reset all player scores
    const playersInRoom = getPlayersInRoom(room.roomId);
    for (const p of playersInRoom) {
        p.score = 0;
        p.hasGuessed = false;
        p.isDrawing = false;
        p.canGuess = true;
    }

    room.currentRound = 1;
    room.totalRounds = GAME_CONFIG.totalRounds;
    room.drawOrder = [...room.players]; // shuffle draw order
    shuffleArray(room.drawOrder);
    room.roundDrawnCount = 0;
    room.currentDrawerIndex = -1;

    broadcastToRoom(room.roomId, { type: "game_starting", totalRounds: room.totalRounds });

    // Short delay before first turn
    setTimeout(() => startTurn(room), 1500);
}

// ---- Start Turn ----

function startTurn(room: Room): void {
    if (room.players.length < GAME_CONFIG.minPlayers) return;

    // Move to next drawer
    room.currentDrawerIndex++;

    // If we've gone through all players in drawOrder, handle it
    if (room.currentDrawerIndex >= room.drawOrder.length) {
        // All players have drawn this round, move to next round
        room.currentRound++;
        if (room.currentRound > room.totalRounds) {
            endGame(room);
            return;
        }
        // Reset for new round
        room.drawOrder = [...room.players];
        shuffleArray(room.drawOrder);
        room.currentDrawerIndex = 0;
        room.roundDrawnCount = 0;
    }

    const drawerSocketId = room.drawOrder[room.currentDrawerIndex];
    if (!drawerSocketId || !room.players.includes(drawerSocketId)) {
        // Drawer is no longer in the room, skip
        startTurn(room);
        return;
    }

    const drawer = getPlayer(drawerSocketId);
    if (!drawer) {
        startTurn(room);
        return;
    }

    // Reset player states for the new turn
    const playersInRoom = getPlayersInRoom(room.roomId);
    for (const p of playersInRoom) {
        p.hasGuessed = false;
        p.isDrawing = p.socketId === drawerSocketId;
        // Re-enable guessing for all players every turn
        // (previous drawers need canGuess reset to true)
        // Late joiners get re-enabled at round boundaries
        if (p.socketId !== drawerSocketId) {
            p.canGuess = true;
        }
    }
    // Drawer can't guess their own word
    drawer.canGuess = false;

    room.roundDrawnCount++;
    room.word = null;

    // Pick 3 random words for the drawer to choose from
    const wordChoices = getRandomWords(GAME_CONFIG.wordChoices);

    room.phase = "picking";

    // Tell the drawer to pick a word
    sendTo(drawerSocketId, { type: "pick_word", words: wordChoices });

    // Tell everyone else who's drawing
    const totalTurns = room.drawOrder.length;
    const currentTurn = room.currentDrawerIndex + 1;

    broadcastToRoom(room.roomId, {
        type: "round_start",
        round: room.currentRound,
        drawer: drawer.username,
        wordLength: 0, // will update when word is picked
        totalTurns,
        currentTurn,
    });

    // Send updated player list
    broadcastToRoom(room.roomId, {
        type: "player_list",
        players: playersInRoom.map((p) => toPlayerInfo(p, room)),
    });

    // Auto-pick timer — if drawer doesn't pick within 15s
    clearRoomTimers(room);
    room.timeLeft = GAME_CONFIG.pickTime;

    room.timerInterval = setInterval(() => {
        room.timeLeft--;
        broadcastToRoom(room.roomId, { type: "timer_update", timeLeft: room.timeLeft });
        if (room.timeLeft <= 0) {
            // Auto-pick first word
            selectWord(drawerSocketId, room, wordChoices[0]!);
        }
    }, 1000);
}

// ---- Select Word ----

export function selectWord(socketId: string, room: Room, word: string): void {
    const player = getPlayer(socketId);
    if (!player || !player.isDrawing) return;
    if (room.phase !== "picking") return;

    room.word = word;
    room.phase = "drawing";

    clearRoomTimers(room);

    // Send the word to the drawer
    sendTo(socketId, { type: "you_are_drawing", word });

    // Send word hint (blanks) to guessers
    const hint = word.split("").map((c) => (c === " " ? "  " : "_")).join(" ");
    broadcastToRoom(room.roomId, { type: "word_hint", hint }, socketId);

    // Update round_start with actual word length
    broadcastToRoom(room.roomId, {
        type: "round_start",
        round: room.currentRound,
        drawer: player.username,
        wordLength: word.length,
        totalTurns: room.drawOrder.length,
        currentTurn: room.currentDrawerIndex + 1,
    });

    // Clear canvas for new turn
    broadcastToRoom(room.roomId, { type: "clear_canvas" });

    // Start draw timer
    room.timeLeft = GAME_CONFIG.roundTime;
    broadcastToRoom(room.roomId, { type: "timer_update", timeLeft: room.timeLeft });

    room.timerInterval = setInterval(() => {
        room.timeLeft--;
        broadcastToRoom(room.roomId, { type: "timer_update", timeLeft: room.timeLeft });
        if (room.timeLeft <= 0) {
            endRound(room);
        }
    }, 1000);
}

// ---- Handle Guess ----

export function handleGuess(socketId: string, room: Room, text: string): void {
    const player = getPlayer(socketId);
    if (!player) return;

    // Drawer can't guess
    if (player.isDrawing) return;

    // Already guessed
    if (player.hasGuessed) return;

    // Late joiner can't guess this round
    if (!player.canGuess) {
        sendTo(socketId, {
            type: "chat_message",
            player: "System",
            text: "You can't guess this round (joined mid-game).",
            isSystem: true,
        });
        return;
    }

    // Rate limiting
    const now = Date.now();
    if (now - player.lastGuessTime < GAME_CONFIG.guessRateLimitMs) return;
    player.lastGuessTime = now;

    if (!room.word || room.phase !== "drawing") return;

    const guess = text.trim().toLowerCase();
    const answer = room.word.toLowerCase();

    if (guess === answer) {
        // Correct guess!
        player.hasGuessed = true;

        // Time-based scoring
        const timeRatio = room.timeLeft / GAME_CONFIG.roundTime;
        const score = Math.max(10, Math.ceil(timeRatio * 100));
        player.score += score;

        // Drawer bonus
        const drawer = getPlayersInRoom(room.roomId).find((p) => p.isDrawing);
        if (drawer) {
            drawer.score += 10;
        }

        broadcastToRoom(room.roomId, {
            type: "correct_guess",
            player: player.username,
            score,
            totalScore: player.score,
        });

        broadcastToRoom(room.roomId, {
            type: "chat_message",
            player: "System",
            text: `🎉 ${player.username} guessed the word!`,
            isSystem: true,
        });

        // Update player list
        const playersInRoom = getPlayersInRoom(room.roomId);
        broadcastToRoom(room.roomId, {
            type: "player_list",
            players: playersInRoom.map((p) => toPlayerInfo(p, room)),
        });

        // Check if all guessers have guessed
        const guessers = playersInRoom.filter((p) => !p.isDrawing && p.canGuess);
        if (guessers.every((p) => p.hasGuessed)) {
            endRoundEarly(room);
        }
    } else {
        // Check for close guess
        if (isCloseGuess(guess, answer)) {
            sendTo(socketId, {
                type: "close_guess",
                text: "That's close!",
            });
        }

        // Broadcast as regular chat message (but hide if it contains the word)
        if (!guess.includes(answer) && !answer.includes(guess)) {
            broadcastToRoom(room.roomId, {
                type: "chat_message",
                player: player.username,
                text,
            });
        } else {
            // Only show to the sender to prevent revealing letters
            sendTo(socketId, {
                type: "chat_message",
                player: player.username,
                text,
            });
        }
    }
}

// ---- End Round ----

function endRound(room: Room): void {
    clearRoomTimers(room);
    room.phase = "round_end";

    const leaderboard = buildLeaderboard(room);

    broadcastToRoom(room.roomId, {
        type: "round_end",
        word: room.word || "???",
        leaderboard,
    });

    // Reset drawing state
    const playersInRoom = getPlayersInRoom(room.roomId);
    for (const p of playersInRoom) {
        p.isDrawing = false;
        p.hasGuessed = false;
    }

    // After delay, start next turn or end game
    room.timer = setTimeout(() => {
        const nextDrawerIndex = room.currentDrawerIndex + 1;

        if (nextDrawerIndex >= room.drawOrder.length) {
            // All players have drawn this round
            if (room.currentRound >= room.totalRounds) {
                endGame(room);
            } else {
                room.currentRound++;
                room.drawOrder = [...room.players];
                shuffleArray(room.drawOrder);
                room.currentDrawerIndex = -1;
                room.roundDrawnCount = 0;
                startTurn(room);
            }
        } else {
            startTurn(room);
        }
    }, GAME_CONFIG.roundEndDelay * 1000);
}

export function endRoundEarly(room: Room): void {
    // Give a brief moment before ending
    setTimeout(() => {
        if (room.phase === "drawing") {
            endRound(room);
        }
    }, 1000);
}

// ---- End Game ----

function endGame(room: Room): void {
    clearRoomTimers(room);
    room.phase = "game_end";

    const leaderboard = buildLeaderboard(room);
    const winner = leaderboard.length > 0 ? leaderboard[0]!.username : "Nobody";

    broadcastToRoom(room.roomId, {
        type: "game_end",
        leaderboard,
        winner,
    });
}

// ---- Play Again ----

export function handlePlayAgain(socketId: string, room: Room): void {
    if (room.hostId !== socketId) {
        sendTo(socketId, { type: "room_error", message: "Only the host can restart" });
        return;
    }

    // Reset everything
    const playersInRoom = getPlayersInRoom(room.roomId);
    for (const p of playersInRoom) {
        p.score = 0;
        p.hasGuessed = false;
        p.isDrawing = false;
        p.canGuess = true;
    }

    room.currentRound = 0;
    room.currentDrawerIndex = -1;
    room.word = null;
    room.phase = "waiting";
    room.roundDrawnCount = 0;
    clearRoomTimers(room);

    // Send updated player list
    broadcastToRoom(room.roomId, {
        type: "player_list",
        players: playersInRoom.map((p) => toPlayerInfo(p, room)),
    });

    broadcastToRoom(room.roomId, {
        type: "chat_message",
        player: "System",
        text: "Game reset! Host can start a new game.",
        isSystem: true,
    });
}

// ---- Drawer Disconnect ----

export function handleDrawerDisconnect(room: Room): void {
    clearRoomTimers(room);

    broadcastToRoom(room.roomId, {
        type: "chat_message",
        player: "System",
        text: "The drawer left! Skipping to next turn...",
        isSystem: true,
    });

    if (room.word) {
        broadcastToRoom(room.roomId, {
            type: "round_end",
            word: room.word,
            leaderboard: buildLeaderboard(room),
        });
    }

    // Reset drawing states
    const playersInRoom = getPlayersInRoom(room.roomId);
    for (const p of playersInRoom) {
        p.isDrawing = false;
        p.hasGuessed = false;
    }

    room.phase = "round_end";

    // Start next turn after delay
    room.timer = setTimeout(() => {
        if (room.players.length >= GAME_CONFIG.minPlayers) {
            // Don't increment currentDrawerIndex — the array was already modified
            room.currentDrawerIndex--; // compensate for the startTurn increment
            startTurn(room);
        }
    }, GAME_CONFIG.roundEndDelay * 1000);
}

// ---- Helpers ----

function buildLeaderboard(room: Room): LeaderboardEntry[] {
    const playersInRoom = getPlayersInRoom(room.roomId);
    return playersInRoom
        .map((p) => ({
            username: p.username,
            score: p.score,
            roundScore: 0, // could track per-round
        }))
        .sort((a, b) => b.score - a.score);
}

function getRandomWords(count: number): string[] {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function shuffleArray(arr: string[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
}

function isCloseGuess(guess: string, answer: string): boolean {
    if (Math.abs(guess.length - answer.length) > 2) return false;
    const distance = levenshtein(guess, answer);
    return distance > 0 && distance <= 2;
}

function levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) {
                matrix[i]![j] = matrix[i - 1]![j - 1]!;
            } else {
                matrix[i]![j] = Math.min(
                    matrix[i - 1]![j - 1]! + 1,
                    matrix[i]![j - 1]! + 1,
                    matrix[i - 1]![j]! + 1
                );
            }
        }
    }
    return matrix[b.length]![a.length]!;
}
