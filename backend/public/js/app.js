// ============================================
// App Entry Point — wires everything together
// ============================================

(function () {
    // ---- State ----
    let username = '';
    let currentRoomId = '';
    let isHost = false;
    let players = [];
    let usernameDebounceTimer = null;
    let hasShownWelcome = false;

    // ---- DOM Elements ----
    const usernameInput = document.getElementById('username-input');
    const usernameError = document.getElementById('username-error');
    const roomCodeInput = document.getElementById('room-code-input');
    const btnCreate = document.getElementById('btn-create-room');
    const btnJoin = document.getElementById('btn-join-room');
    const btnStart = document.getElementById('btn-start-game');
    const btnLeave = document.getElementById('btn-leave-room');
    const btnCopyCode = document.getElementById('btn-copy-code');
    const lobbyRoomCode = document.getElementById('lobby-room-code');
    const lobbyPlayerList = document.getElementById('lobby-player-list');
    const playerCount = document.getElementById('player-count');
    const lobbyWaitingText = document.getElementById('lobby-waiting-text');

    // ---- Init ----
    function init() {
        Canvas.init();
        Chat.init();
        Game.init();
        Socket.connect();

        setupSocketHandlers();
        setupUIHandlers();
    }

    // ---- Socket Event Handlers ----
    function setupSocketHandlers() {
        Socket.on('connected', (msg) => {
            Socket.setSocketId(msg.socketId);
            enableButtons();
        });

        Socket.on('username_set', (msg) => {
            if (msg.success) {
                usernameError.textContent = '';
                btnCreate.disabled = false;
                btnJoin.disabled = false;
                if (!hasShownWelcome) {
                    hasShownWelcome = true;
                    UI.showToast(`Welcome, ${username}!`);
                }
            } else {
                usernameError.textContent = msg.error;
                btnCreate.disabled = true;
                btnJoin.disabled = true;
            }
        });

        Socket.on('room_created', (msg) => {
            currentRoomId = msg.roomId;
            isHost = true;
        });

        Socket.on('room_joined', (msg) => {
            currentRoomId = msg.roomId;
            players = msg.players;
            showLobby();
        });

        Socket.on('room_error', (msg) => {
            UI.showToast(msg.message);
        });

        Socket.on('player_joined', (msg) => {
            players.push(msg.player);
            updateLobbyPlayerList();
            Chat.addMessage('System', `${msg.player.username} joined!`, 'system');
        });

        Socket.on('player_left', (msg) => {
            players = players.filter(p => p.socketId !== msg.player.socketId);
            if (msg.newHost) {
                players.forEach(p => {
                    if (p.username === msg.newHost) p.isHost = true;
                    else p.isHost = false;
                });
                // Check if I'm the new host
                const me = players.find(p => p.socketId === Socket.getSocketId());
                if (me && me.isHost) {
                    isHost = true;
                }
            }
            updateLobbyPlayerList();
            Chat.addMessage('System', `${msg.player.username} left.`, 'system');
        });

        Socket.on('player_list', (msg) => {
            players = msg.players;
            updateLobbyPlayerList();
            Game.updateGamePlayerList(players);
        });

        Socket.on('chat_message', (msg) => {
            Chat.addMessage(msg.player, msg.text, msg.isSystem ? 'system' : '');
        });

        // Game starting → transition handled by game.js
        Socket.on('game_starting', () => {
            // Update players in game sidebar
            Game.updateGamePlayerList(players);
        });
    }

    // ---- UI Event Handlers ----
    function setupUIHandlers() {
        // Username input validation (debounced — waits 500ms after typing stops)
        usernameInput.addEventListener('input', () => {
            const val = usernameInput.value.trim();

            // Immediate client-side validation feedback
            if (val.length > 0 && val.length < 2) {
                usernameError.textContent = 'Too short (min 2 characters)';
                btnCreate.disabled = true;
                btnJoin.disabled = true;
            } else if (val.length > 16) {
                usernameError.textContent = 'Too long (max 16 characters)';
                btnCreate.disabled = true;
                btnJoin.disabled = true;
            } else if (val.length > 0 && !/^[a-zA-Z0-9_ ]+$/.test(val)) {
                usernameError.textContent = 'Only letters, numbers, spaces, underscores';
                btnCreate.disabled = true;
                btnJoin.disabled = true;
            } else {
                usernameError.textContent = '';
            }

            // Debounce the server call
            if (usernameDebounceTimer) clearTimeout(usernameDebounceTimer);
            usernameDebounceTimer = setTimeout(() => {
                const trimmed = usernameInput.value.trim();
                if (trimmed.length >= 2 && trimmed.length <= 16 && /^[a-zA-Z0-9_ ]+$/.test(trimmed)) {
                    username = trimmed;
                    Socket.send('set_username', { username: trimmed });
                }
            }, 500);
        });

        // Create room
        btnCreate.addEventListener('click', () => {
            if (!username) return;
            isHost = true;
            Socket.send('create_room');
        });

        // Join room
        btnJoin.addEventListener('click', () => {
            const code = roomCodeInput.value.trim().toUpperCase();
            if (!code) return;
            if (!username) return;
            isHost = false;
            Socket.send('join_room', { roomId: code });
        });

        roomCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnJoin.click();
        });

        // Start game (host only)
        btnStart.addEventListener('click', () => {
            Socket.send('start_game');
        });

        // Leave room
        btnLeave.addEventListener('click', () => {
            Socket.send('leave_room');
            UI.showView('landing');
            currentRoomId = '';
            isHost = false;
            players = [];
        });

        // Copy room code
        btnCopyCode.addEventListener('click', () => {
            navigator.clipboard.writeText(currentRoomId).then(() => {
                UI.showToast('Room code copied!');
            }).catch(() => {
                UI.showToast('Failed to copy');
            });
        });
    }

    function enableButtons() {
        // Enable after socket connects, but user still needs username
        const val = usernameInput.value.trim();
        if (val.length >= 2) {
            btnCreate.disabled = false;
            btnJoin.disabled = false;
        }
    }

    // ---- Lobby ----
    function showLobby() {
        UI.showView('lobby');
        lobbyRoomCode.textContent = currentRoomId;
        updateLobbyPlayerList();
    }

    function updateLobbyPlayerList() {
        lobbyPlayerList.innerHTML = '';
        players.forEach((p, i) => {
            lobbyPlayerList.appendChild(UI.renderPlayerItem(p, i));
        });
        playerCount.textContent = players.length;

        // Check if I'm the host
        const me = players.find(p => p.socketId === Socket.getSocketId());
        isHost = me?.isHost || false;

        if (isHost) {
            btnStart.style.display = 'flex';
            lobbyWaitingText.style.display = 'none';
            btnStart.disabled = players.length < 2;
        } else {
            btnStart.style.display = 'none';
            lobbyWaitingText.style.display = 'block';
        }

        // Also update game sidebar if in game view
        Game.updateGamePlayerList(players);
    }

    // ---- Boot ----
    init();
})();
