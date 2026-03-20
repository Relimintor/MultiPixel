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
        const element = typeof options.element === 'string'
            ? document.getElementById(options.element)
            : (options.element || document.getElementById('crosshair'));
        const textureMap = buildTextureMap(options.basePath);

        if (!element) {
            return {
                getState: () => 'default',
                getVisible: () => true,
                refresh: () => {},
                setState: () => {},
                setVisible: () => {},
            };
        }

        let currentState = '';
        let isVisible = true;

        function applyState(nextState) {
            const resolvedState = resolveTextureKey(nextState);
            if (currentState === resolvedState) return resolvedState;
            currentState = resolvedState;
            element.dataset.crosshairState = resolvedState;
            element.style.backgroundImage = `url('${textureMap[resolvedState]}')`;
            return resolvedState;
        }

        function setVisible(visible) {
            const nextVisible = visible !== false;
            if (isVisible === nextVisible) return isVisible;
            isVisible = nextVisible;
            element.classList.toggle('crosshair-hidden', !nextVisible);
            element.setAttribute('aria-hidden', nextVisible ? 'false' : 'true');
            return isVisible;
        }

        applyState(options.initialState || 'default');
        setVisible(options.visible);

        return {
            getState: () => currentState || 'default',
            getVisible: () => isVisible,
            refresh: () => applyState(currentState || 'default'),
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
