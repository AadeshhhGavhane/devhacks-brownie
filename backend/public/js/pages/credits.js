// ============================================
// Credits Page — Balance display & top-up via PhonePe
// ============================================

const CreditsPage = (() => {
    let balanceEl;
    let backLink;
    let buyButtons;
    let historyList;

    function init() {
        balanceEl = document.getElementById('credits-balance');
        backLink = document.getElementById('link-back-from-credits');
        buyButtons = document.querySelectorAll('.btn-buy-credits');
        historyList = document.getElementById('credits-history-list');

        if (backLink) {
            backLink.addEventListener('click', (e) => {
                e.preventDefault();
                UI.showView('landing');
            });
        }

        buyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const pack = parseInt(btn.dataset.pack, 10);
                if (pack) buyPack(pack);
            });
        });
    }

    async function show() {
        UI.showView('credits');
        await Promise.all([loadBalance(), loadHistory()]);
    }

    async function loadBalance() {
        try {
            const data = await Api.get('/credits/balance');
            if (balanceEl) {
                balanceEl.textContent = data.credits ?? 0;
            }
        } catch (err) {
            console.error('Failed to load credits balance:', err);
        }
    }

    async function buyPack(pack) {
        // Disable all buy buttons
        buyButtons.forEach(btn => { btn.disabled = true; btn.textContent = '...'; });

        try {
            const data = await Api.post('/credits/buy', { pack });
            if (data.redirectUrl) {
                // Redirect to PhonePe payment page
                window.location.href = data.redirectUrl;
            } else {
                UI.showToast('Failed to initiate payment', 3000);
            }
        } catch (err) {
            console.error('Payment initiation failed:', err);
            UI.showToast(err.message || 'Payment failed', 3000);
        } finally {
            buyButtons.forEach(btn => { btn.disabled = false; btn.textContent = 'Buy'; });
        }
    }

    async function loadHistory() {
        if (!historyList) return;
        try {
            const data = await Api.get('/credits/history');
            const txns = data.transactions || [];
            if (txns.length === 0) {
                historyList.innerHTML = '<p class="muted-text">No transactions yet.</p>';
                return;
            }
            historyList.innerHTML = txns.map(txn => {
                const date = new Date(txn.createdAt);
                const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                const stateClass = txn.state === 'COMPLETED' ? 'success' : txn.state === 'FAILED' ? 'failed' : 'pending';
                const stateIcon = txn.state === 'COMPLETED' ? '✅' : txn.state === 'FAILED' ? '❌' : '⏳';
                const amount = txn.amountPaise ? '₹' + (txn.amountPaise / 100) : '';
                return `
                    <div class="txn-row">
                        <div class="txn-info">
                            <span class="txn-credits">+${txn.credits} credits</span>
                            <span class="txn-date">${dateStr} ${timeStr}</span>
                        </div>
                        <div class="txn-right">
                            <span class="txn-amount">${amount}</span>
                            <span class="txn-state ${stateClass}">${stateIcon} ${txn.state}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('Failed to load history:', err);
            historyList.innerHTML = '<p class="muted-text">Failed to load history.</p>';
        }
    }

    // Update balance from external source (e.g., after credits_deducted event)
    function updateBalance(credits) {
        if (balanceEl) {
            balanceEl.textContent = credits;
        }
    }

    return { init, show, loadBalance, updateBalance };
})();
