(function () {
  function execute(parts, ctx) {
    const privilege = String(parts[1] || '').toLowerCase();

    if (!privilege) {
      return { handled: true, ok: false, message: 'Usage: /ungrantme <fly|speed|noclip>' };
    }

    if (!ctx.ungrantPrivilege) {
      return { handled: true, ok: false, message: 'Privilege system unavailable.' };
    }

    const removed = ctx.ungrantPrivilege(privilege);
    if (!removed) {
      return { handled: true, ok: false, message: 'Unknown privilege. Use: fly, speed, noclip.' };
    }

    return { handled: true, ok: true, message: `Removed privilege: ${privilege}.` };
  }

  window.SingleplayerChatCommandUnGrantMe = { execute };
})();
