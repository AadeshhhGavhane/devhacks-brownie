// ============================================
// App Entry Point — wires everything together
// ============================================

const App = (() => {
  // ---- State ----
  let currentUser = null; // { email, username, firstName, lastName, avatar, gamesPlayed, gamesWon, totalScore }
  let currentRoomId = '';
  let isHost = false;
  let players = [];

  // ---- DOM Elements ----
  const roomCodeInput = document.getElementById('room-code-input');
  const btnCreate = document.getElementById('btn-create-room');
  const btnJoin = document.getElementById('btn-join-room');
  const btnStart = document.getElementById('btn-start-game');
  const btnLeave = document.getElementById('btn-leave-room');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const btnLogout = document.getElementById('btn-logout');
  const btnProfile = document.getElementById('btn-profile');
  const btnNearby = document.getElementById('btn-nearby');
  const btnCredits = document.getElementById('btn-credits');
  const lobbyRoomCode = document.getElementById('lobby-room-code');
  const lobbyPlayerList = document.getElementById('lobby-player-list');
  const playerCount = document.getElementById('player-count');
  const lobbyWaitingText = document.getElementById('lobby-waiting-text');
  const userDisplayName = document.getElementById('user-display-name');
  const userAvatarDisplay = document.getElementById('user-avatar-display');
  const userStats = document.getElementById('user-stats');

  // ---- Init ----
  async function init() {
    Canvas.init();
    Chat.init();
    Game.init();

    // Init auth pages
    LoginPage.init();
    MfaLoginPage.init();
    RegisterPage.init();
    VerifyEmailPage.init();
    ForgotPasswordPage.init();
    ProfilePage.init();
    NearbyPage.init();
    CreditsPage.init();

    setupUIHandlers();

    // Check auth status on load
    await checkAuth();
  }

  async function checkAuth() {
    try {
      const res = await Api.get('/me');
      currentUser = res.user;
      showLanding();
    } catch {
      // Not authenticated
      UI.showView('login');
    }
  }

  // Called after successful login
  function onLoginSuccess(user) {
    currentUser = user;
    showLanding();
    UI.showToast(`Welcome back, ${getDisplayName()}!`);
  }

  // Called when token refresh fails
  function onSessionExpired() {
    currentUser = null;
    Socket.disconnect();
    UI.showView('login');
    UI.showToast('Session expired — please sign in again.');
  }

  function getDisplayName() {
    if (!currentUser) return 'Player';
    return currentUser.username || currentUser.email.split('@')[0];
  }

  function showLanding() {
    // Update user info display
    const name = getDisplayName();
    userDisplayName.textContent = name;

    // Avatar
    if (currentUser.avatar) {
      userAvatarDisplay.innerHTML = `<img src="${currentUser.avatar}" alt="avatar">`;
      userAvatarDisplay.classList.add('has-img');
    } else {
      userAvatarDisplay.textContent = name[0].toUpperCase();
      userAvatarDisplay.classList.remove('has-img');
    }

    // Stats
    userStats.innerHTML = `
      <span>💰 ${currentUser.credits ?? 0} credits</span>
      <span>🎮 ${currentUser.gamesPlayed || 0} games</span>
      <span>🏆 ${currentUser.gamesWon || 0} wins</span>
      <span>⭐ ${currentUser.totalScore || 0} pts</span>
    `;

    btnCreate.disabled = false;
    btnJoin.disabled = false;

    UI.showView('landing');

    // Check for payment redirect
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('credits') === 'success') {
      UI.showToast('✅ Credits added to your account!');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Connect WebSocket (uses cookies automatically)
    Socket.connect();
    setupSocketHandlers();
  }

  // ---- Socket Event Handlers ----
  let socketHandlersSetup = false;
  function setupSocketHandlers() {
    if (socketHandlersSetup) return;
    socketHandlersSetup = true;

    Socket.on('connected', (msg) => {
      Socket.setSocketId(msg.socketId);
      UI.setConnectionStatus('connected');
      // Update credits from server
      if (msg.credits !== undefined && currentUser) {
        currentUser.credits = msg.credits;
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

    Socket.on('game_starting', () => {
      Game.updateGamePlayerList(players);
    });

    Socket.on('credits_deducted', (msg) => {
      if (currentUser) {
        currentUser.credits = msg.remaining;
      }
      UI.showToast(`💰 ${msg.cost} credits deducted • ${msg.remaining} remaining`);
      CreditsPage.updateBalance(msg.remaining);
    });
  }

  // ---- UI Event Handlers ----
  function setupUIHandlers() {
    // Create room
    btnCreate.addEventListener('click', () => {
      isHost = true;
      Socket.send('create_room');
    });

    // Join room
    btnJoin.addEventListener('click', () => {
      const code = roomCodeInput.value.trim().toUpperCase();
      if (!code) {
        UI.showToast('Enter a room code');
        return;
      }
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

    // Logout
    btnLogout.addEventListener('click', async () => {
      try {
        await Api.post('/auth/logout');
      } catch { /* ignore */ }
      currentUser = null;
      Socket.disconnect();
      UI.showView('login');
      UI.showToast('Signed out');
    });

    // Profile
    btnProfile.addEventListener('click', () => {
      ProfilePage.show();
    });

    // Nearby Players
    btnNearby.addEventListener('click', () => {
      NearbyPage.show();
    });

    // Credits
    if (btnCredits) {
      btnCredits.addEventListener('click', () => {
        CreditsPage.show();
      });
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

    Game.updateGamePlayerList(players);
  }

  // Refresh landing view data (called after profile edits)
  async function refreshLanding() {
    try {
      const res = await Api.get('/me');
      currentUser = res.user;
      // Re-render landing user info
      const name = getDisplayName();
      userDisplayName.textContent = name;
      if (currentUser.avatar) {
        userAvatarDisplay.innerHTML = `<img src="${currentUser.avatar}" alt="avatar">`;
        userAvatarDisplay.classList.add('has-img');
      } else {
        userAvatarDisplay.textContent = name[0].toUpperCase();
        userAvatarDisplay.innerHTML = '';
        userAvatarDisplay.textContent = name[0].toUpperCase();
        userAvatarDisplay.classList.remove('has-img');
      }
      userStats.innerHTML = `
        <span>💰 ${currentUser.credits ?? 0} credits</span>
        <span>🎮 ${currentUser.gamesPlayed || 0} games</span>
        <span>🏆 ${currentUser.gamesWon || 0} wins</span>
        <span>⭐ ${currentUser.totalScore || 0} pts</span>
      `;
    } catch { /* ignore */ }
  }

  // ---- Boot ----
  init();

  return { onLoginSuccess, onSessionExpired, refreshLanding };
})();
