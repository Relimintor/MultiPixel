(function () {
    function normalizeAmount(rawAmount) {
        const parsed = Number.parseInt(rawAmount, 10);
        if (!Number.isFinite(parsed)) return 1;
        return Math.max(1, Math.min(64, parsed));
    }

    function execute(rawInput, ctx) {
        if (!rawInput || rawInput[0] !== '/') return { handled: false };

        const parts = rawInput.trim().split(/\s+/);
        const command = (parts[0] || '').toLowerCase();

        if (command === '/give') {
            const id = Number.parseInt(parts[1], 10);
            const amount = normalizeAmount(parts[2]);

            if (!Number.isFinite(id)) {
                return { handled: true, ok: false, message: 'Usage: /give <itemId> <amount>' };
            }

            const itemDef = ctx.getBlockById ? ctx.getBlockById(id) : null;
            if (!itemDef || itemDef.id === 0) {
                return { handled: true, ok: false, message: `Item id ${id} was not found.` };
            }

            const added = ctx.addToInventory ? ctx.addToInventory(id, amount) : false;
            if (!added) {
                return { handled: true, ok: false, message: 'Could not add item (inventory full).' };
            }

            return {
                handled: true,
                ok: true,
                message: `Given ${amount}x ${itemDef.name} (id ${id}).`
            };
        }

        return { handled: true, ok: false, message: `Unknown command: ${command}` };
    }

    window.SingleplayerChatCommands = { execute };
})();
