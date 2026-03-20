(function () {
    const CENSOR_WORDS_PATHS = [
        './chat/cencor/words.txt',
        './chat/cencor/fuck.txt'
    ];
    const FEED_COLLAPSE_MS = 4200;

    let root = null;
    let feedEl = null;
    let logEl = null;
    let inputEl = null;
    let closeBtn = null;
    let helpOverlayEl = null;
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

    // ✅ LOAD MULTIPLE FILES
    async function loadCensorWords() {
        try {
            const results = await Promise.all(
                CENSOR_WORDS_PATHS.map(path =>
                    fetch(path, { cache: 'no-store' })
                        .then(res => res.ok ? res.text() : '')
                        .catch(() => '')
                )
            );

            censorWords = results
                .join('\n')
                .split(/\r?\n/)
                .map(word => word.trim().toLowerCase())
                .filter(Boolean);

            console.log('[Chat] Loaded censor words:', censorWords.length);
        } catch (err) {
            console.warn('[Chat] Failed to load censor words', err);
        }
    }

    // 🔥 NORMALIZE (kills leetspeak + symbols)
    function normalize(str) {
        return str
            .toLowerCase()
            .replace(/0/g, 'o')
            .replace(/1/g, 'i')
            .replace(/3/g, 'e')
            .replace(/4/g, 'a')
            .replace(/5/g, 's')
            .replace(/7/g, 't')
            .replace(/[@]/g, 'a')
            .replace(/[!]/g, 'i')
            .replace(/\$/g, 's')
            .replace(/[^a-z]/g, '');
    }

    // 🔥 STRONG DETECTION
    function hasCensoredWord(input) {
        const raw = String(input || '');
        const normalized = normalize(raw);

        return censorWords.find(word => {
            if (!word) return false;

            // direct normalized match
            if (normalized.includes(word)) return true;

            // pattern match (f.u.c.k, f u c k, etc)
            const pattern = word.split('').join('[^a-z0-9]*');
            const regex = new RegExp(pattern, 'i');

            return regex.test(raw);
        });
    }

    function openCommandHelp() {
        if (!helpOverlayEl) return;
        helpOverlayEl.classList.add('open');
    }

    function closeCommandHelp() {
        if (!helpOverlayEl) return;
        helpOverlayEl.classList.remove('open');
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
        closeCommandHelp();
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
            const warning = `Warning: "${censored}" this is a curse word.`;
            pushMessage(warning, 'chat-system-error');
            if (context?.showGameMessage) context.showGameMessage(warning);
            inputEl.value = '';
            return;
        }

        pushMessage(`Player: ${rawInput}`, 'chat-player');
        inputEl.value = '';
    }

    function buildUI() {
        if (document.getElementById('chat-panel')) return;

        root = document.createElement('div');
        root.id = 'chat-panel';
        root.innerHTML = `
            <div id="chat-feed"></div>
            <div id="chat-compose-wrap">
                <button id="chat-close-btn" type="button">
                    <img id="chat-close-icon" draggable="false" />
                </button>
                <div id="chat-log"></div>
                <input id="chat-input" type="text" maxlength="180" placeholder="Type message..." autocomplete="off" />
            </div>
        `;
        document.body.appendChild(root);

        feedEl = document.getElementById('chat-feed');
        logEl = document.getElementById('chat-log');
        inputEl = document.getElementById('chat-input');
        closeBtn = document.getElementById('chat-close-btn');

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitChatMessage();
            }
        });
    }

    function init(initContext) {
        context = initContext || {};
        buildUI();
        loadCensorWords();
        pushMessage('Chat ready.', 'chat-info');
    }

    window.SingleplayerChat = {
        init,
        open,
        close,
        toggle,
        isOpen: () => isOpen
    };
})();
