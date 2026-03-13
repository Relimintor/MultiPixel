(function () {
  function execute(parts, ctx) {
    const privilege = String(parts[1] || '').toLowerCase();

    if (!privilege) {
      return { handled: true, ok: false, message: 'Usage: /grantme <fly|speed|noclip|all>' };
    }

    if (!ctx.grantPrivilege) {
      return { handled: true, ok: false, message: 'Privilege system unavailable.' };
    }

    const granted = ctx.grantPrivilege(privilege);
    if (!granted) {
      return { handled: true, ok: false, message: 'Unknown privilege. Use: fly, speed, noclip, all.' };
    }

    return { handled: true, ok: true, message: `Granted privilege: ${privilege}.` };
  }

  window.SingleplayerChatCommandGrantMe = { execute };
})();
