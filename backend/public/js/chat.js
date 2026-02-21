// ============================================
// Chat & Guessing
// ============================================

const Chat = (() => {
    const messagesEl = document.getElementById('chat-messages');
    const inputEl = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send-chat');

    function init() {
        sendBtn.addEventListener('click', sendMessage);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    function sendMessage() {
        const text = inputEl.value.trim();
        if (!text) return;
        Socket.send('guess', { text });
        inputEl.value = '';
    }

    function addMessage(player, text, cssClass = '') {
        const div = document.createElement('div');
        div.className = `chat-msg ${cssClass}`;

        if (cssClass === 'system' || cssClass === 'correct') {
            div.textContent = text;
        } else {
            div.innerHTML = `<span class="chat-author">${UI.escapeHtml(player)}:</span>${UI.escapeHtml(text)}`;
        }

        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addCloseGuess(text) {
        const div = document.createElement('div');
        div.className = 'chat-msg close-guess';
        div.textContent = `🔥 ${text}`;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function clearMessages() {
        messagesEl.innerHTML = '';
    }

    function setDisabled(disabled) {
        inputEl.disabled = disabled;
        sendBtn.disabled = disabled;
        inputEl.placeholder = disabled ? "You can't guess right now" : "Type your guess...";
    }

    return { init, addMessage, addCloseGuess, clearMessages, setDisabled };
})();
