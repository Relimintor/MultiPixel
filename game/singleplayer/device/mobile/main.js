(function () {
  function create(options = {}) {
    const {
      mobileControls,
      mobileAssetBase = './assets/mobile',
      player,
      getIsInventoryOpen,
      getYawObject,
      getPitchObject,
      setCrosshairVisible,
      toggleInventory,
      toggleCameraViewMode,
      toggleChat,
      updateSkinPreviewLook,
      getTargetBlockFromCrosshair,
      beginMiningTarget,
      updateBreakingOverlay,
      interactOrPlaceAtCrosshair,
      getMiningState,
      setIsLeftMouseDown,
    } = options;

    function setMobileHudVisible(visible) {
      const controlsEl = document.getElementById('mobile-controls');
      if (controlsEl) {
        if (visible) controlsEl.classList.add('active');
        else controlsEl.classList.remove('active');
      }
      setCrosshairVisible?.(!visible);
    }

    function switchToDesktopMode() {
      if (!mobileControls?.enabled) return;
      mobileControls.enabled = false;
      mobileControls.moveX = 0;
      mobileControls.moveY = 0;
      mobileControls.sprint = false;
      mobileControls.jump = false;
      mobileControls.worldTouchActive = false;
      mobileControls.lookPointerId = null;
      setMobileHudVisible(false);
      if (!getIsInventoryOpen?.()) {
        const el = document.body;
        if (document.pointerLockElement !== el) {
          el.requestPointerLock();
        }
      }
    }

    function setupMobileControls() {
      if (!mobileControls?.enabled || mobileControls.initialized) return;
      mobileControls.initialized = true;

      const controlsEl = document.getElementById('mobile-controls');
      const joyWrap = document.getElementById('mobile-joystick');
      const joyBg = document.getElementById('mobile-joystick-bg');
      const joyCenter = document.getElementById('mobile-joystick-center');
      const jumpBtn = document.getElementById('mobile-jump-btn');
      const invBtn = document.getElementById('mobile-inventory-btn');
      const fastBtn = document.getElementById('mobile-fast-btn');
      const camBtn = document.getElementById('mobile-camera-btn');
      const chatBtn = document.getElementById('mobile-chat-btn');

      if (!controlsEl || !joyWrap || !joyBg || !joyCenter || !jumpBtn || !invBtn || !fastBtn) return;

      setMobileHudVisible(true);
      joyBg.src = `${mobileAssetBase}/joystick_off.png`;
      joyCenter.src = `${mobileAssetBase}/joystick_center.png`;
      jumpBtn.src = `${mobileAssetBase}/jump_btn.png`;
      invBtn.src = `${mobileAssetBase}/inventory_btn.png`;
      fastBtn.src = `${mobileAssetBase}/fast_btn.png`;
      if (camBtn) camBtn.src = `${mobileAssetBase}/camera_btn.png`;
      if (chatBtn) {
        chatBtn.src = `${mobileAssetBase}/chat_btn.png`;
        chatBtn.onerror = () => {
          chatBtn.onerror = null;
          chatBtn.src = `${mobileAssetBase}/inventory_btn.png`;
        };
      }
      const instructions = document.getElementById('instructions');
      if (instructions) instructions.style.opacity = 0;
      if (player) player.canMove = true;

      function resetJoystick() {
        mobileControls.moveX = 0;
        mobileControls.moveY = 0;
        mobileControls.joystickPointerId = null;
        joyCenter.style.left = '40px';
        joyCenter.style.top = '40px';
        joyBg.src = `${mobileAssetBase}/joystick_off.png`;
      }

      joyBg.addEventListener('pointerdown', (e) => {
        mobileControls.joystickPointerId = e.pointerId;
        joyBg.setPointerCapture(e.pointerId);
        joyBg.src = `${mobileAssetBase}/joystick_bg.png`;
        e.preventDefault();
      });

      joyBg.addEventListener('pointermove', (e) => {
        if (mobileControls.joystickPointerId !== e.pointerId) return;
        const rect = joyWrap.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const maxR = 44;
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(maxR, len);
        const nx = (dx / len) * clamped;
        const ny = (dy / len) * clamped;
        mobileControls.moveX = nx / maxR;
        mobileControls.moveY = ny / maxR;
        joyCenter.style.left = `${40 + nx}px`;
        joyCenter.style.top = `${40 + ny}px`;
      });

      const releaseJoystick = (e) => {
        if (mobileControls.joystickPointerId !== e.pointerId) return;
        resetJoystick();
      };
      joyBg.addEventListener('pointerup', releaseJoystick);
      joyBg.addEventListener('pointercancel', releaseJoystick);

      const holdButton = (el, key) => {
        const start = (e) => { mobileControls[key] = true; e.preventDefault(); };
        const end = (e) => { mobileControls[key] = false; e.preventDefault(); };
        el.addEventListener('pointerdown', start);
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.addEventListener('pointerleave', end);
      };

      holdButton(jumpBtn, 'jump');
      holdButton(fastBtn, 'sprint');

      invBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        toggleInventory?.();
      });
      if (camBtn) camBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        toggleCameraViewMode?.();
      });
      if (chatBtn) chatBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        toggleChat?.();
      });

      const mobileControlTargets = new Set([joyBg, jumpBtn, invBtn, fastBtn, camBtn, chatBtn]);
      window.addEventListener('pointerdown', (e) => {
        if (!mobileControls.enabled || !player?.canMove || getIsInventoryOpen?.()) return;
        if (mobileControlTargets.has(e.target)) return;
        if (e.pointerType !== 'touch') return;
        mobileControls.worldTouchActive = true;
        mobileControls.worldTouchPointerId = e.pointerId;
        mobileControls.worldTouchStartMs = performance.now();
        mobileControls.isMiningTouch = false;
        mobileControls.lookPointerId = e.pointerId;
        mobileControls.lastLookX = e.clientX;
        mobileControls.lastLookY = e.clientY;
        if (mobileControls.miningTimer) clearTimeout(mobileControls.miningTimer);
        mobileControls.miningTimer = setTimeout(() => {
          if (!mobileControls.worldTouchActive) return;
          const target = getTargetBlockFromCrosshair?.();
          if (!target) return;
          setIsLeftMouseDown?.(true);
          mobileControls.isMiningTouch = true;
          beginMiningTarget?.(target);
          updateBreakingOverlay?.();
        }, 180);
      }, { passive: false });

      window.addEventListener('pointermove', (e) => {
        if (!mobileControls.enabled || !player?.canMove) return;
        if (getIsInventoryOpen?.()) {
          updateSkinPreviewLook?.(e.clientX, e.clientY);
          return;
        }
        if (e.pointerType !== 'touch') return;
        if (mobileControls.lookPointerId !== e.pointerId) return;

        const yawObject = getYawObject?.();
        const pitchObject = getPitchObject?.();
        if (!yawObject || !pitchObject || !player) return;

        const dx = e.clientX - mobileControls.lastLookX;
        const dy = e.clientY - mobileControls.lastLookY;
        mobileControls.lastLookX = e.clientX;
        mobileControls.lastLookY = e.clientY;

        yawObject.rotation.y -= dx * player.rotationSpeed * 0.85;
        pitchObject.rotation.x -= dy * player.rotationSpeed * 0.85;
        pitchObject.rotation.x = Math.max(-1.5, Math.min(1.5, pitchObject.rotation.x));
      }, { passive: true });

      const endWorldTouch = (e) => {
        if (!mobileControls.enabled || e.pointerType !== 'touch') return;
        if (mobileControls.worldTouchPointerId !== e.pointerId) return;
        if (mobileControls.miningTimer) clearTimeout(mobileControls.miningTimer);

        const miningState = getMiningState?.();
        const wasMining = mobileControls.isMiningTouch;
        const touchDuration = performance.now() - mobileControls.worldTouchStartMs;
        mobileControls.worldTouchActive = false;
        mobileControls.worldTouchPointerId = null;
        mobileControls.isMiningTouch = false;
        mobileControls.lookPointerId = null;
        setIsLeftMouseDown?.(false);
        if (miningState) miningState.active = false;
        updateBreakingOverlay?.();

        if (!wasMining && touchDuration < 220) {
          interactOrPlaceAtCrosshair?.();
        }
      };

      window.addEventListener('pointerup', endWorldTouch, { passive: false });
      window.addEventListener('pointercancel', endWorldTouch, { passive: false });
    }

    function setupInputModeChooser() {
      const mobileBtn = document.getElementById('mode-mobile-btn');
      const pcBtn = document.getElementById('mode-pc-btn');
      if (!mobileBtn || !pcBtn || !mobileControls) return;

      const applyMode = (mode) => {
        const mobile = mode === 'mobile';
        mobileControls.enabled = mobile;
        mobileBtn.classList.toggle('active', mobile);
        pcBtn.classList.toggle('active', !mobile);
        if (mobile) {
          if (mobileControls.initialized) setMobileHudVisible(true);
          else setupMobileControls();
        } else {
          setMobileHudVisible(false);
        }
      };

      mobileBtn.addEventListener('click', (e) => { e.preventDefault(); applyMode('mobile'); });
      pcBtn.addEventListener('click', (e) => { e.preventDefault(); applyMode('pc'); });
      applyMode(mobileControls.autoEnabled ? 'mobile' : 'pc');
    }

    return {
      setMobileHudVisible,
      switchToDesktopMode,
      setupMobileControls,
      setupInputModeChooser,
    };
  }

  window.SingleplayerDeviceMobile = { create };
})();
