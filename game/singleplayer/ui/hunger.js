(function () {
  const state = {
    value: 20,
    max: 20,
    lastTickAt: 0,
    lowHungerWarned: false,
  };

  let onMessage = null;

  function render() {
    const container = document.getElementById('hunger-container');
    if (!container) return;
    container.innerHTML = '';

    const iconPath = window.SingleplayerConfig?.ASSET_FILEPATHS?.FOOD || '';
    const foods = Math.ceil(state.value / 2);

    for (let i = 0; i < foods; i++) {
      const foodImg = document.createElement('img');
      foodImg.src = iconPath;
      foodImg.className = 'food-icon';
      foodImg.alt = 'Food';
      container.appendChild(foodImg);
    }
  }

  function init({ messageCallback } = {}) {
    onMessage = messageCallback || null;
    render();
  }

  function update(nowMs, { isMoving, isSprinting }) {
    if (!state.lastTickAt) state.lastTickAt = nowMs;
    const dt = (nowMs - state.lastTickAt) / 1000;
    state.lastTickAt = nowMs;

    const drain = isSprinting ? 0.45 : (isMoving ? 0.08 : -0.18);
    state.value = Math.max(0, Math.min(state.max, state.value - drain * dt));

    if (state.value < 5 && !state.lowHungerWarned) {
      state.lowHungerWarned = true;
      if (onMessage) onMessage('You are starving! Sprint is weaker now.');
    } else if (state.value >= 5) {
      state.lowHungerWarned = false;
    }

    render();
  }

  function getSpeedMultiplier() {
    if (state.value <= 0) return 0.65;
    if (state.value < 5) return 0.8;
    return 1;
  }

  window.HungerSystem = { init, update, getSpeedMultiplier };
})();
