(function () {
  function create(options = {}) {
    const {
      mobileControls,
      player,
      getIsInventoryOpen,
      getYawObject,
      getPitchObject,
      setCrosshairVisible,
      toggleInventory,
    } = options;

    function setupPointerLockControls() {
      const el = document.body;
      document.addEventListener('pointerlockchange', () => {
        if (mobileControls?.enabled) return;
        const instructions = document.getElementById('instructions');
        if (document.pointerLockElement === el) {
          if (player) player.canMove = true;
          if (getIsInventoryOpen?.()) toggleInventory?.();
          if (instructions) instructions.style.opacity = 0;
          setCrosshairVisible?.(true);
        } else {
          if (player) player.canMove = false;
          if (!getIsInventoryOpen?.() && instructions) {
            instructions.style.opacity = 1;
          }
        }
      });

      document.addEventListener('mousemove', (e) => {
        if (mobileControls?.enabled) return;
        if (!player?.canMove || getIsInventoryOpen?.()) return;
        const yawObject = getYawObject?.();
        const pitchObject = getPitchObject?.();
        if (!yawObject || !pitchObject || !player) return;
        yawObject.rotation.y -= e.movementX * player.rotationSpeed;
        pitchObject.rotation.x -= e.movementY * player.rotationSpeed;
        pitchObject.rotation.x = Math.max(-1.5, Math.min(1.5, pitchObject.rotation.x));
      });

      const instructions = document.getElementById('instructions');
      if (instructions) {
        instructions.onclick = () => {
          if (mobileControls?.enabled) {
            if (player) player.canMove = true;
            instructions.style.opacity = 0;
            return;
          }
          if (!getIsInventoryOpen?.()) el.requestPointerLock();
        };
      }
    }

    return { setupPointerLockControls };
  }

  window.SingleplayerDevicePc = { create };
})();
