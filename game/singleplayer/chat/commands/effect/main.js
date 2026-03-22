(function () {
  function parseDurationToSeconds(raw) {
    const text = String(raw || '').trim().toLowerCase();
    if (!text) return Number.NaN;
    const m = text.match(/^(\d+(?:\.\d+)?)(s|m|h)?$/);
    if (!m) return Number.NaN;
    const value = Number(m[1]);
    if (!Number.isFinite(value) || value <= 0) return Number.NaN;
    const unit = m[2] || 's';
    if (unit === 'h') return value * 3600;
    if (unit === 'm') return value * 60;
    return value;
  }

  function execute(parts, ctx) {
    const targetRaw = String(parts[1] || '').toLowerCase();
    const effectRaw = String(parts[2] || '').toLowerCase();
    const durationRaw = parts[3];
    if (!targetRaw || !effectRaw || !durationRaw) {
      return { handled: true, ok: false, message: 'Usage: /effect <me|player> <nausea> <duration[s|m|h]>' };
    }
    if (targetRaw !== 'me' && targetRaw !== 'player') {
      return { handled: true, ok: false, message: 'Only "me" or "player" targets are supported.' };
    }
    if (effectRaw !== 'nausea') {
      return { handled: true, ok: false, message: 'Only nausea is supported right now.' };
    }
    const durationSeconds = parseDurationToSeconds(durationRaw);
    if (!Number.isFinite(durationSeconds)) {
      return { handled: true, ok: false, message: 'Invalid duration. Example: 15s, 30, 2m.' };
    }
    if (!ctx.applyPlayerEffect || !ctx.applyPlayerEffect(effectRaw, durationSeconds, { source: 'command' })) {
      return { handled: true, ok: false, message: 'Could not apply effect.' };
    }
    return { handled: true, ok: true, message: `Applied ${effectRaw} for ${Math.round(durationSeconds)}s.` };
  }

  window.SingleplayerChatCommandEffect = { execute };
})();
