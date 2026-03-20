(function () {
    const CENSOR_WORDS_PATH = './chat/cencor/words.txt';
    const CENCOR_WORDS_PATH = './chat/cencor/fuck.txt';
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

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function hasCensoredWord(input) {
        const normalized = String(input || '').toLowerCase();
        return censorWords.find((word) => {
            const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}([^a-z0-9]|$)`, 'i');
            return pattern.test(normalized);
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
                <button id="chat-close-btn" type="button" aria-label="Close chat">
                    <img id="chat-close-icon" alt="close chat" draggable="false" />
                </button>
                <div id="chat-log"></div>
                <input id="chat-input" type="text" maxlength="180" placeholder="Type message or /give, /spawn, /tp, /time, /height, /gamemode, /grantme, /ungrantme, /set, /enchant, /help" autocomplete="off" />
            </div>
            <div id="chat-help-overlay" role="dialog" aria-label="Command help">
                <div id="chat-help-panel">
                    <h3>Command Help</h3>
                    <p><strong>/give</strong> &lt;itemId|itemName&gt; &lt;amount&gt; — give item stacks.</p>
                    <p><strong>/spawn</strong> &lt;mobId|mobName&gt; <strong>[amount]</strong> <strong>[height:&lt;blocks&gt;]</strong> — spawn mobs and optionally include a height argument (1 = pig, 2 = zombie, 3 = wolf, 4 = panda).</p>
                    <p><strong>/spawn structure:village biome:&lt;name&gt; building:&lt;json_name&gt;</strong> — place a village building near you (example: <em>building:house_small</em>).</p>
                    <p><strong>/tp</strong> &lt;x y z&gt; or <strong>/tp biome:&lt;name&gt;</strong> or <strong>/tp structure:village biome:&lt;name&gt;</strong> — teleport to coordinates, nearest biome, or village candidate in a village biome.</p>
                    <p><strong>/time</strong> &lt;HH:MM&gt; — set time with military clock (00:00 to 23:59).</p>
                    <p><strong>/height</strong> &lt;amount&gt; — set the player height in blocks (default 1.8, no upper cap).</p>
                    <p><strong>/set render_distance</strong> &lt;amount&gt; — set chunk render distance (no hard upper cap).</p>
                    <p><strong>/set fov</strong> &lt;amount&gt; — set camera field of view (no hard upper cap).</p>
                    <p><strong>/gamemode creative</strong> — switch to creative and open creative menu.</p>
                    <p><strong>/enchant</strong> &lt;holding|itemId&gt; &lt;knockback&gt; &lt;amount&gt; — apply knockback enchant (max 400).</p>
                    <p><strong>/grantme</strong> &lt;fly|speed|noclip|all&gt; — grant yourself movement privileges.</p>
                    <p><strong>/ungrantme</strong> &lt;fly|speed|noclip|all&gt; — remove movement privileges.</p>
                    <p><strong>/help</strong> — open this command help panel.</p>
                    <button id="chat-help-close" type="button">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        feedEl = document.getElementById('chat-feed');
        logEl = document.getElementById('chat-log');
        inputEl = document.getElementById('chat-input');
        closeBtn = document.getElementById('chat-close-btn');
        helpOverlayEl = document.getElementById('chat-help-overlay');
        const helpCloseBtn = document.getElementById('chat-help-close');
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
                if (helpOverlayEl?.classList.contains('open')) {
                    closeCommandHelp();
                    return;
                }
                close();
            }
        });

        if (helpCloseBtn) {
            helpCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeCommandHelp();
            });
        }

        if (helpOverlayEl) {
            helpOverlayEl.addEventListener('click', (e) => {
                if (e.target === helpOverlayEl) closeCommandHelp();
            });
        }
    }

    function init(initContext) {
        context = initContext || {};
        buildUI();
        loadCensorWords();
        pushMessage('Chat ready. Use /give, /spawn, /tp, /time, /height, /set, /enchant, /gamemode, /grantme, /ungrantme, /help. Try /spawn structure:village biome:plains building:house_small', 'chat-info');
    }

    window.SingleplayerChat = {
        init,
        open,
        close,
        toggle,
        openCommandHelp,
        isOpen: () => isOpen
    };
})();
