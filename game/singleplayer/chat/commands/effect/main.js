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
    if (targetRaw !== 'me' && targetRaw !== 'player') {
      return { handled: true, ok: false, message: 'Target must be "me" or "player <player_name>".' };
    }

    const usesNamedTarget = targetRaw === 'player';
    const expectedPartCount = usesNamedTarget ? 5 : 4;
    if (parts.length !== expectedPartCount) {
      return { handled: true, ok: false, message: 'Usage: /effect <me|player <player_name>> <nausea|badlands> <duration[s|m|h]>' };
    }

    const playerTargetRaw = usesNamedTarget ? String(parts[2] || '').trim() : 'me';
    const effectRaw = String(parts[usesNamedTarget ? 3 : 2] || '').toLowerCase();
    const durationRaw = parts[usesNamedTarget ? 4 : 3];
    if (effectRaw !== 'nausea' && effectRaw !== 'badlands') {
      return { handled: true, ok: false, message: 'Only nausea and badlands are supported right now.' };
    }
    const durationSeconds = parseDurationToSeconds(durationRaw);
    if (!Number.isFinite(durationSeconds)) {
      return { handled: true, ok: false, message: 'Invalid duration. Example: 15s, 30, 2m.' };
    }

    const targetIdentity = playerTargetRaw;
    if (!ctx.applyPlayerEffect || !ctx.applyPlayerEffect(effectRaw, durationSeconds, { source: 'command', target: targetIdentity })) {
      return { handled: true, ok: false, message: 'Could not apply effect.' };
    }
    return { handled: true, ok: true, message: `Applied ${effectRaw} to ${targetIdentity} for ${Math.round(durationSeconds)}s.` };
  }

  window.SingleplayerChatCommandEffect = { execute };
})();
