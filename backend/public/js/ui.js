// ============================================
// UI Helpers — view switching, modals, toasts, tab alerts
// ============================================

const UI = (() => {
    const ORIGINAL_TITLE = 'Scribble — Draw & Guess!';
    let titleFlashInterval = null;
    let modalAutoHideTimer = null;

    function showView(viewName) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(`view-${viewName}`);
        if (view) view.classList.add('active');
    }

    function showModal(html) {
        // Cancel any pending auto-hide from a previous modal
        if (modalAutoHideTimer) {
            clearTimeout(modalAutoHideTimer);
            modalAutoHideTimer = null;
        }
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        content.innerHTML = html;
        overlay.classList.add('active');
    }

    function hideModal() {
        if (modalAutoHideTimer) {
            clearTimeout(modalAutoHideTimer);
            modalAutoHideTimer = null;
        }
        document.getElementById('modal-overlay').classList.remove('active');
    }

    // Auto-hide modal after delay (safe — won't hide a different modal)
    function scheduleModalHide(delayMs) {
        if (modalAutoHideTimer) clearTimeout(modalAutoHideTimer);
        modalAutoHideTimer = setTimeout(() => {
            modalAutoHideTimer = null;
            hideModal();
        }, delayMs);
    }

    function showToast(message, duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    function setConnectionStatus(status) {
        const dot = document.querySelector('.status-dot');
        const text = document.querySelector('.status-text');
        dot.className = 'status-dot ' + status;
        const labels = {
            connected: 'Connected',
            error: 'Disconnected',
            '': 'Connecting...'
        };
        text.textContent = labels[status] || 'Connecting...';
    }

    function formatTime(seconds) {
        return String(Math.max(0, seconds));
    }

    // Flash the browser tab title to alert unfocused players
    function flashTitle(message) {
        stopFlashTitle();
        let isOriginal = false;
        titleFlashInterval = setInterval(() => {
            document.title = isOriginal ? message : ORIGINAL_TITLE;
            isOriginal = !isOriginal;
        }, 800);

        // Stop flashing when tab becomes visible
        const onVisible = () => {
            if (!document.hidden) {
                stopFlashTitle();
                document.removeEventListener('visibilitychange', onVisible);
            }
        };
        document.addEventListener('visibilitychange', onVisible);
    }

    function stopFlashTitle() {
        if (titleFlashInterval) {
            clearInterval(titleFlashInterval);
            titleFlashInterval = null;
        }
        document.title = ORIGINAL_TITLE;
    }

    // Render a player list item
    function renderPlayerItem(player, index) {
        const li = document.createElement('li');
        const avatarColor = `avatar-${(index % 8) + 1}`;
        const initial = player.username ? player.username[0].toUpperCase() : '?';

        let tags = '';
        if (player.isHost) tags += '<span class="player-tag host">Host</span>';
        if (player.isDrawing) tags += '<span class="player-tag drawing">✏️</span>';
        if (player.hasGuessed) tags += '<span class="player-tag guessed">✓</span>';

        // Use avatar image if available, otherwise initial
        let avatarHtml;
        if (player.avatar) {
            avatarHtml = `<div class="player-avatar has-img"><img src="${escapeHtml(player.avatar)}" alt=""></div>`;
        } else {
            avatarHtml = `<div class="player-avatar ${avatarColor}">${initial}</div>`;
        }

        const locationName = player.location ? player.location.name : '';

        li.innerHTML = `
      ${avatarHtml}
      <div class="player-info">
        <span class="player-name">${escapeHtml(player.username)}</span>
        ${locationName ? `<span class="player-location">\ud83d\udccd ${escapeHtml(locationName)}</span>` : ''}
      </div>
      ${tags}
      <span class="player-score">${player.score}</span>
    `;
        const tooltipParts = [player.username];
        if (locationName) tooltipParts.push('\ud83d\udccd ' + locationName);
        li.setAttribute('title', tooltipParts.join('\n'));
        return li;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    return { showView, showModal, hideModal, scheduleModalHide, showToast, setConnectionStatus, formatTime, renderPlayerItem, escapeHtml, flashTitle, stopFlashTitle };
})();
