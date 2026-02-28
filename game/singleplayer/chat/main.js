(function () {
    const CENSOR_WORDS_PATH = './chat/cencor/words.txt';
    const FEED_COLLAPSE_MS = 4200;

    let root = null;
    let feedEl = null;
    let logEl = null;
    let inputEl = null;
    let closeBtn = null;
    let isOpen = false;
    let context = null;
    let censorWords = [];
    let feedMessages = [];
    let collapseTimer = null;

    function appendToLog(text, type) {
        if (!logEl) return;
        const row = document.createElement('div');
        row.className = `chat-row ${type || 'chat-info'}`;
        row.textContent = text;
        logEl.appendChild(row);
        logEl.scrollTop = logEl.scrollHeight;
    }

    function renderFeed(compact = false) {
        if (!feedEl) return;
        const visibleCount = compact ? 1 : 2;
        const visible = feedMessages.slice(-visibleCount);
        feedEl.innerHTML = '';
        visible.forEach((entry) => {
            const line = document.createElement('div');
            line.className = `chat-row ${entry.type || 'chat-info'}`;
            line.textContent = entry.text;
            feedEl.appendChild(line);
        });
    }

    function scheduleFeedCollapse() {
        if (collapseTimer) clearTimeout(collapseTimer);
        renderFeed(false);
        collapseTimer = setTimeout(() => {
            if (isOpen) return;
            renderFeed(true);
        }, FEED_COLLAPSE_MS);
    }

    function pushMessage(text, type) {
        const entry = { text, type: type || 'chat-info', at: Date.now() };
        feedMessages.push(entry);
        if (feedMessages.length > 40) feedMessages = feedMessages.slice(-40);
        appendToLog(text, type);
        scheduleFeedCollapse();
    }

    async function loadCensorWords() {
        try {
            const response = await fetch(CENSOR_WORDS_PATH, { cache: 'no-store' });
            if (!response.ok) return;
            const text = await response.text();
            censorWords = text
                .split(/\r?\n/)
                .map((word) => word.trim().toLowerCase())
                .filter(Boolean);
        } catch (err) {
            console.warn('[Chat] Failed to load censor words', err);
        }
    }

    function hasCensoredWord(input) {
        const normalized = ` ${String(input || '').toLowerCase()} `;
        return censorWords.find((word) => normalized.includes(` ${word} `));
    }

    function open() {
        if (!root || isOpen) return;
        isOpen = true;
        root.classList.add('open');
        if (collapseTimer) clearTimeout(collapseTimer);
        renderFeed(false);
        if (context && context.onOpen) context.onOpen();
        setTimeout(() => {
            if (inputEl) inputEl.focus();
        }, 0);
    }

    function close() {
        if (!root || !isOpen) return;
        isOpen = false;
        root.classList.remove('open');
        if (context && context.onClose) context.onClose();
        scheduleFeedCollapse();
    }

    function toggle() {
        if (isOpen) close();
        else open();
    }

    function submitChatMessage() {
        if (!inputEl) return;
        const rawInput = inputEl.value.trim();
        if (!rawInput) {
            close();
            return;
        }

        if (rawInput[0] === '/' && window.SingleplayerChatCommands?.execute) {
            const result = window.SingleplayerChatCommands.execute(rawInput, context || {});
            if (result && result.handled) {
                const msg = result.message || rawInput;
                pushMessage(msg, result.ok ? 'chat-system-ok' : 'chat-system-error');
                if (context?.showGameMessage && result.message) context.showGameMessage(result.message);
                inputEl.value = '';
                return;
            }
        }

        const censored = hasCensoredWord(rawInput);
        if (censored) {
            const warning = `Warning: "${censored}" is blocked in chat.`;
            pushMessage(warning, 'chat-system-error');
            if (context?.showGameMessage) context.showGameMessage(warning);
            inputEl.value = '';
            return;
        }

        pushMessage(`You: ${rawInput}`, 'chat-player');
        inputEl.value = '';
    }

    function buildUI() {
        if (document.getElementById('chat-panel')) return;

        root = document.createElement('div');
        root.id = 'chat-panel';
        root.innerHTML = `
            <div id="chat-feed"></div>
            <div id="chat-compose-wrap">
                <button id="chat-close-btn" type="button" aria-label="Close chat">
                    <img id="chat-close-icon" alt="close chat" draggable="false" />
                </button>
                <div id="chat-log"></div>
                <input id="chat-input" type="text" maxlength="180" placeholder="Type message or /give <id> <amount>" autocomplete="off" />
            </div>
        `;
        document.body.appendChild(root);

        feedEl = document.getElementById('chat-feed');
        logEl = document.getElementById('chat-log');
        inputEl = document.getElementById('chat-input');
        closeBtn = document.getElementById('chat-close-btn');
        const closeIcon = document.getElementById('chat-close-icon');
        const mobileAssetBase = context?.mobileAssetBase || './assets/mobile';
        if (closeIcon) closeIcon.src = `${mobileAssetBase}/cdb_clear.png`;

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                close();
            });
        }

        inputEl.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                submitChatMessage();
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        });
    }

    function init(initContext) {
        context = initContext || {};
        buildUI();
        loadCensorWords();
        pushMessage('Chat ready. Use /give <id> <amount>.', 'chat-info');
    }

    window.SingleplayerChat = {
        init,
        open,
        close,
        toggle,
        isOpen: () => isOpen
    };
})();
