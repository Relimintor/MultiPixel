window.SingleplayerAdaptiveCrosshair = (() => {
    const DEFAULT_BASE_PATH = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || '/MultiPixel'}/game/singleplayer/mod/adapt_crosshair/textures`;
    const TEXTURE_FILES = Object.freeze({
        clear: 'adaptive_crosshair_clear.png',
        default: 'adaptive_crosshair_default.png',
        interact: 'daptive_crosshair_interact.png',
        mine: 'adaptive_crosshair_mine.png',
        use: 'adaptive_crosshair_use.png',
        use_self: 'adaptive_crosshair_use_self.png',
        attack: 'adaptive_crosshair_attack.png',
    });
    const STATE_ALIASES = Object.freeze({
        idle: 'default',
        default: 'default',
        clear: 'clear',
        hidden: 'clear',
        interact: 'interact',
        use: 'use',
        passive: 'use',
        use_self: 'use_self',
        self_use: 'use_self',
        mining: 'mine',
        mine: 'mine',
        hostile: 'attack',
        attack: 'attack',
        blocked: 'default',
    });

    function buildTextureMap(basePath = DEFAULT_BASE_PATH) {
        const normalizedBase = String(basePath || DEFAULT_BASE_PATH).replace(/\/+$/, '');
        return Object.fromEntries(
            Object.entries(TEXTURE_FILES).map(([key, filename]) => [key, `${normalizedBase}/${filename}`])
        );
    }

    function resolveTextureKey(stateKey) {
        const normalizedKey = typeof stateKey === 'string' ? stateKey.trim().toLowerCase() : '';
        return STATE_ALIASES[normalizedKey] || 'default';
    }

    function createController(options = {}) {
        const resolveElement = () => {
            const candidate = typeof options.element === 'string'
                ? document.getElementById(options.element)
                : (options.element || document.getElementById('crosshair'));
            return candidate || null;
        };
        const textureMap = buildTextureMap(options.basePath);
        let currentState = resolveTextureKey(options.initialState || 'default');
        let isVisible = true;

        function syncElement() {
            const element = resolveElement();
            if (!element) return null;
            element.dataset.crosshairState = currentState;
            element.style.backgroundImage = `url('${textureMap[currentState]}')`;
            element.classList.toggle('crosshair-hidden', !isVisible);
            element.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
            return element;
        }

        function applyState(nextState) {
            const resolvedState = resolveTextureKey(nextState);
            if (currentState === resolvedState) {
                syncElement();
                return resolvedState;
            }
            currentState = resolvedState;
            const element = resolveElement();
            if (element) {
                element.dataset.crosshairState = resolvedState;
                element.style.backgroundImage = `url('${textureMap[resolvedState]}')`;
            }
            return resolvedState;
        }

        function setVisible(visible) {
            const nextVisible = visible !== false;
            if (isVisible === nextVisible) {
                syncElement();
                return isVisible;
            }
            isVisible = nextVisible;
            const element = resolveElement();
            if (element) {
                element.classList.toggle('crosshair-hidden', !nextVisible);
                element.setAttribute('aria-hidden', nextVisible ? 'false' : 'true');
            }
            return isVisible;
        }

        syncElement();
        setVisible(options.visible);

        return {
            getState: () => currentState || 'default',
            getVisible: () => isVisible,
            refresh: syncElement,
            setState: applyState,
            setVisible,
        };
    }

    return {
        createController,
        resolveTextureKey,
        buildTextureMap,
    };
})();
