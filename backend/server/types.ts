// ============================================
// Scribble Clone MVP — Shared Types
// ============================================

export interface Player {
    socketId: string;
    userId: string;
    username: string;
    roomId: string | null;
    score: number;
    hasGuessed: boolean;
    isDrawing: boolean;
    canGuess: boolean; // false for late joiners until next round
    lastGuessTime: number; // rate limiting
}

export type RoomPhase =
    | "waiting"
    | "picking"
    | "drawing"
    | "round_end"
    | "game_end";

export interface Room {
    roomId: string;
    hostId: string;
    players: string[]; // socketIds
    currentRound: number;
    totalRounds: number;
    currentDrawerIndex: number;
    word: string | null;
    phase: RoomPhase;
    timer: ReturnType<typeof setTimeout> | null;
    timerInterval: ReturnType<typeof setInterval> | null;
    timeLeft: number;
    maxPlayers: number;
    drawOrder: string[]; // socketIds in drawing order for the round
    roundDrawnCount: number; // how many players have drawn this round
}

export const GAME_CONFIG = {
    maxPlayers: 8,
    roundTime: 60,
    pickTime: 30,
    roundEndDelay: 5,
    totalRounds: 3,
    wordChoices: 3,
    minPlayers: 2,
    guessRateLimitMs: 500,
    port: 3000,
} as const;

// ============================================
// WebSocket Message Types
// ============================================

// Client → Server
export type ClientMessage =
    | { type: "set_username"; username: string }
    | { type: "create_room" }
    | { type: "join_room"; roomId: string }
    | { type: "leave_room" }
    | { type: "start_game" }
    | { type: "select_word"; word: string }
    | { type: "draw"; x: number; y: number; color: string; strokeWidth: number; drawType: "start" | "draw" | "end" }
    | { type: "clear_canvas" }
    | { type: "guess"; text: string }
    | { type: "play_again" };

// Server → Client
export type ServerMessage =
    | { type: "connected"; socketId: string }
    | { type: "username_set"; success: boolean; error?: string }
    | { type: "room_created"; roomId: string }
    | { type: "room_joined"; roomId: string; players: PlayerInfo[] }
    | { type: "room_error"; message: string }
    | { type: "player_joined"; player: PlayerInfo }
    | { type: "player_left"; player: PlayerInfo; newHost?: string }
    | { type: "game_starting"; totalRounds: number }
    | { type: "pick_word"; words: string[] }
    | { type: "round_start"; round: number; drawer: string; wordLength: number; totalTurns: number; currentTurn: number }
    | { type: "draw"; x: number; y: number; color: string; strokeWidth: number; drawType: "start" | "draw" | "end" }
    | { type: "clear_canvas" }
    | { type: "correct_guess"; player: string; score: number; totalScore: number }
    | { type: "chat_message"; player: string; text: string; isSystem?: boolean }
    | { type: "timer_update"; timeLeft: number }
    | { type: "round_end"; word: string; leaderboard: LeaderboardEntry[] }
    | { type: "game_end"; leaderboard: LeaderboardEntry[]; winner: string }
    | { type: "player_list"; players: PlayerInfo[] }
    | { type: "you_are_drawing"; word: string }
    | { type: "word_hint"; hint: string }
    | { type: "close_guess"; text: string };

export interface PlayerInfo {
    socketId: string;
    username: string;
    score: number;
    isHost: boolean;
    isDrawing: boolean;
    hasGuessed: boolean;
    canGuess: boolean;
}

export interface LeaderboardEntry {
    username: string;
    score: number;
    roundScore: number;
}
