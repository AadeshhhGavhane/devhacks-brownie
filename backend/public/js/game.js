// ============================================
// Game State Renderer
// ============================================

const Game = (() => {
    let currentRound = 0;
    let maxTime = 60;
    let amDrawing = false;

    function init() {
        // Listen to all game-related server events
        Socket.on('game_starting', onGameStarting);
        Socket.on('pick_word', onPickWord);
        Socket.on('round_start', onRoundStart);
        Socket.on('you_are_drawing', onYouAreDrawing);
        Socket.on('word_hint', onWordHint);
        Socket.on('draw', onDraw);
        Socket.on('clear_canvas', onClearCanvas);
        Socket.on('correct_guess', onCorrectGuess);
        Socket.on('timer_update', onTimerUpdate);
        Socket.on('round_end', onRoundEnd);
        Socket.on('game_end', onGameEnd);
        Socket.on('player_list', onPlayerList);
        Socket.on('close_guess', onCloseGuess);
    }

    function onGameStarting(msg) {
        UI.showView('game');
        Chat.clearMessages();
        Canvas.clearCanvas();
        Canvas.setEnabled(false);
        Chat.addMessage('System', `Game starting! ${msg.totalRounds} round(s). Get ready!`, 'system');
        document.getElementById('word-text').textContent = 'Get Ready!';
        amDrawing = false;
    }

    function onPickWord(msg) {
        amDrawing = true;
        // Flash tab title so unfocused players notice it's their turn
        UI.flashTitle('🎨 YOUR TURN! — Scribble');
        let html = `
      <div class="modal-title">🎨 Your Turn to Draw!</div>
      <div class="modal-subtitle">Pick a word:</div>
      <div class="word-choices">
    `;
        msg.words.forEach(word => {
            html += `<button class="word-choice-btn" onclick="Game.pickWord('${word.replace(/'/g, "\\'")}')">${UI.escapeHtml(word)}</button>`;
        });
        html += '</div>';
        UI.showModal(html);
    }

    function pickWord(word) {
        UI.hideModal();
        UI.stopFlashTitle();
        Socket.send('select_word', { word });
    }

    function onRoundStart(msg) {
        currentRound = msg.round;
        document.getElementById('game-round').textContent = `Round ${msg.round}`;
        document.getElementById('game-turn').textContent = `Turn ${msg.currentTurn}/${msg.totalTurns}`;

        if (!amDrawing) {
            Canvas.setEnabled(false);
            Chat.setDisabled(false);
            document.getElementById('word-text').textContent = 'Waiting for drawer...';
        }
    }

    function onYouAreDrawing(msg) {
        amDrawing = true;
        Canvas.setEnabled(true);
        Canvas.clearCanvas();
        Chat.setDisabled(true);
        document.getElementById('word-text').textContent = msg.word;
        Chat.addMessage('System', `You're drawing: ${msg.word}`, 'system');
    }

    function onWordHint(msg) {
        if (!amDrawing) {
            document.getElementById('word-text').textContent = msg.hint;
        }
    }

    function onDraw(msg) {
        Canvas.handleRemoteDraw(msg);
    }

    function onClearCanvas() {
        Canvas.clearCanvas();
    }

    function onCorrectGuess(msg) {
        Chat.addMessage('System', `🎉 ${msg.player} guessed the word! (+${msg.score} pts)`, 'correct');
    }

    function onTimerUpdate(msg) {
        const timerText = document.getElementById('timer-text');
        const timerBar = document.getElementById('timer-bar');

        timerText.textContent = msg.timeLeft;
        // Determine max time based on phase
        if (msg.timeLeft > maxTime) maxTime = msg.timeLeft;

        const pct = (msg.timeLeft / maxTime) * 100;
        timerBar.style.width = pct + '%';

        timerBar.classList.remove('warning', 'danger');
        if (pct <= 25) timerBar.classList.add('danger');
        else if (pct <= 50) timerBar.classList.add('warning');

        // Flash timer when low
        if (msg.timeLeft <= 10) {
            timerText.style.color = 'var(--accent-danger)';
        } else {
            timerText.style.color = 'var(--accent-secondary)';
        }
    }

    function onRoundEnd(msg) {
        amDrawing = false;
        Canvas.setEnabled(false);
        Chat.setDisabled(true);

        let html = `
      <div class="modal-title">⏱️ Round Over!</div>
      <div class="modal-subtitle">The word was: <strong>${UI.escapeHtml(msg.word)}</strong></div>
      <div class="leaderboard">
    `;
        msg.leaderboard.forEach((entry, i) => {
            const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
            html += `
        <div class="leaderboard-item">
          <span class="leaderboard-rank">${rank}</span>
          <span class="leaderboard-name">${UI.escapeHtml(entry.username)}</span>
          <span class="leaderboard-score">${entry.score}</span>
        </div>
      `;
        });
        html += '</div>';
        UI.showModal(html);

        // Auto-hide after a few seconds (safe — cancelled if a new modal opens)
        UI.scheduleModalHide(5000);
    }

    function onGameEnd(msg) {
        amDrawing = false;
        Canvas.setEnabled(false);
        Chat.setDisabled(true);

        let html = `
      <div class="winner-crown">👑</div>
      <div class="modal-title">Game Over!</div>
      <div class="modal-subtitle">${UI.escapeHtml(msg.winner)} wins!</div>
      <div class="leaderboard">
    `;
        msg.leaderboard.forEach((entry, i) => {
            const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
            html += `
        <div class="leaderboard-item">
          <span class="leaderboard-rank">${rank}</span>
          <span class="leaderboard-name">${UI.escapeHtml(entry.username)}</span>
          <span class="leaderboard-score">${entry.score}</span>
        </div>
      `;
        });
        html += `
      </div>
      <div style="margin-top:20px; display:flex; gap:10px; justify-content:center;">
        <button class="btn btn-primary" onclick="Game.playAgain()">🔄 Play Again</button>
        <button class="btn btn-danger" onclick="Game.leaveGame()">🚪 Leave</button>
      </div>
    `;
        UI.showModal(html);
    }

    function onPlayerList(msg) {
        updateGamePlayerList(msg.players);
    }

    function onCloseGuess(msg) {
        Chat.addCloseGuess(msg.text);
    }

    function updateGamePlayerList(players) {
        const list = document.getElementById('game-player-list');
        list.innerHTML = '';
        players.forEach((p, i) => {
            list.appendChild(UI.renderPlayerItem(p, i));
        });
    }

    function playAgain() {
        UI.hideModal();
        Socket.send('play_again');
        // Will switch back to lobby via game_starting or player_list
        Chat.clearMessages();
        Chat.addMessage('System', 'Waiting for host to start a new game...', 'system');
    }

    function leaveGame() {
        UI.hideModal();
        Socket.send('leave_room');
        UI.showView('landing');
        amDrawing = false;
        Chat.clearMessages();
    }

    // In-game leave button
    document.getElementById('btn-leave-game')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to leave the game?')) {
            leaveGame();
        }
    });

    return { init, pickWord, playAgain, leaveGame, updateGamePlayerList };
})();
