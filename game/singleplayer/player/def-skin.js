(function () {
  const SingleplayerDefaultSkin = {
    create({
      THREE,
      playerRuntime,
      player,
      getCamera,
      getPlayerPrivileges,
      getIsFlyActive,
      getIsInventoryOpen,
      getSelectedHotbarIndex,
      getInventory,
      getBlockMaterials,
      getAssetFilepaths,
      getMiningSwingTimerMs,
      showGameMessage,
    }) {
      const state = {
        playerAvatar: playerRuntime.playerAvatar,
        playerAvatarParts: playerRuntime.playerAvatarParts,
        steveSkinTexture: playerRuntime.steveSkinTexture,
        steveSkinFailed: playerRuntime.steveSkinFailed,
        steveSkinReady: playerRuntime.steveSkinReady,
        steveSkinLoadPromise: playerRuntime.steveSkinLoadPromise,
        firstPersonHandEl: playerRuntime.firstPersonHandEl,
        firstPersonHeldItemEl: playerRuntime.firstPersonHeldItemEl,
        inventorySkinRigEl: playerRuntime.inventorySkinRigEl,
        skinSystem: playerRuntime.skinSystem,
        cameraViewMode: playerRuntime.cameraViewMode || 0,
      };

      function syncRuntimeState() {
        playerRuntime.playerAvatar = state.playerAvatar;
        playerRuntime.playerAvatarParts = state.playerAvatarParts;
        playerRuntime.steveSkinTexture = state.steveSkinTexture;
        playerRuntime.steveSkinFailed = state.steveSkinFailed;
        playerRuntime.steveSkinReady = state.steveSkinReady;
        playerRuntime.steveSkinLoadPromise = state.steveSkinLoadPromise;
        playerRuntime.firstPersonHandEl = state.firstPersonHandEl;
        playerRuntime.firstPersonHeldItemEl = state.firstPersonHeldItemEl;
        playerRuntime.inventorySkinRigEl = state.inventorySkinRigEl;
        playerRuntime.skinSystem = state.skinSystem;
        playerRuntime.cameraViewMode = state.cameraViewMode;
      }

      function getPlayerAssetCandidates(fileName) {
        const repoPrefix = window.SingleplayerConfig?.REPO_BASE_PREFIX || '';
        const fromRepo = `${repoPrefix}/game/singleplayer/assets/player/${fileName}`;
        return [fromRepo, `./assets/player/${fileName}`].filter((v, i, arr) => v && arr.indexOf(v) === i);
      }

      function getPreferredPlayerAssetPath(fileName) {
        return getPlayerAssetCandidates(fileName)[0];
      }

      function resolvePlayerAssetPath(fileName, onResolved) {
        const candidates = getPlayerAssetCandidates(fileName);
        if (!candidates.length) {
          onResolved(null);
          return;
        }
        const probe = new Image();
        const tryLoad = (index) => {
          if (index >= candidates.length) {
            onResolved(null);
            return;
          }
          const candidate = candidates[index];
          probe.onload = () => onResolved(candidate);
          probe.onerror = () => tryLoad(index + 1);
          probe.src = candidate;
        };
        tryLoad(0);
      }

      function ensureSteveSkinTextureLoaded() {
        if (state.steveSkinReady && state.steveSkinTexture) return Promise.resolve(true);
        if (state.steveSkinFailed) return Promise.resolve(false);
        if (state.steveSkinLoadPromise) return state.steveSkinLoadPromise;

        const skinPaths = getPlayerAssetCandidates('character.png');
        state.steveSkinLoadPromise = new Promise((resolve) => {
          const loader = new THREE.TextureLoader();
          const tryLoad = (index) => {
            if (index >= skinPaths.length) {
              state.steveSkinFailed = true;
              state.steveSkinTexture = null;
              syncRuntimeState();
              resolve(false);
              return;
            }
            loader.load(
              skinPaths[index],
              (tex) => {
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                tex.flipY = false;
                state.steveSkinTexture = tex;
                state.steveSkinReady = true;
                syncRuntimeState();
                resolve(true);
              },
              undefined,
              () => tryLoad(index + 1)
            );
          };
          tryLoad(0);
        });
        syncRuntimeState();
        return state.steveSkinLoadPromise;
      }

      function getSteveSkinTexture() {
        if (!state.steveSkinTexture || !state.steveSkinReady) return null;
        return state.steveSkinTexture;
      }

      function createSkinFaceTexture(rect) {
        const [x, y, w, h] = rect;
        const src = getSteveSkinTexture();
        if (!src?.image) return null;
        const atlasW = src.image.naturalWidth || src.image.width || 64;
        const atlasH = src.image.naturalHeight || src.image.height || 64;
        const tex = src.clone();
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.flipY = false;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.repeat.set(w / atlasW, h / atlasH);
        tex.offset.set(x / atlasW, 1 - ((y + h) / atlasH));
        tex.needsUpdate = true;
        return tex;
      }

      function isModernSkinLayout() {
        const tex = getSteveSkinTexture();
        const img = tex?.image || null;
        const h = img ? (img.naturalHeight || img.height || 0) : 0;
        return h >= 64;
      }

      function buildPartFaceRects(x, y, w, h, d) {
        return {
          // BoxGeometry material order: right, left, top, bottom, front, back
          0: [x, y + d, d, h],
          1: [x + d + w, y + d, d, h],
          2: [x + d, y, w, d],
          3: [x + d + w, y, w, d],
          4: [x + d, y + d, w, h],
          5: [x + d + w + d, y + d, w, h],
        };
      }

      function getSkinPartRects(partName, overlay = false) {
        const modern = isModernSkinLayout();
        if (partName === 'head') return buildPartFaceRects(overlay ? 32 : 0, 0, 8, 8, 8);
        if (partName === 'body') {
          if (overlay && !modern) return null;
          return buildPartFaceRects(16, overlay ? 32 : 16, 8, 12, 4);
        }
        if (partName === 'rightArm') {
          if (overlay && !modern) return null;
          return buildPartFaceRects(40, overlay ? 32 : 16, 4, 12, 4);
        }
        if (partName === 'leftArm') {
          if (modern) return buildPartFaceRects(overlay ? 48 : 32, 48, 4, 12, 4);
          if (overlay) return null;
          return buildPartFaceRects(40, 16, 4, 12, 4);
        }
        if (partName === 'rightLeg') {
          if (overlay && !modern) return null;
          return buildPartFaceRects(0, overlay ? 32 : 16, 4, 12, 4);
        }
        if (partName === 'leftLeg') {
          if (modern) return buildPartFaceRects(overlay ? 0 : 16, 48, 4, 12, 4);
          if (overlay) return null;
          return buildPartFaceRects(0, 16, 4, 12, 4);
        }
        return null;
      }

      function createStevePartMesh(dim, faceRects, overlayFaceRects = null) {
        const createMaterials = (rects, isOverlay) => {
          const mats = [];
          for (let i = 0; i < 6; i++) {
            const faceTex = rects ? createSkinFaceTexture(rects[i]) : null;
            mats.push(new THREE.MeshStandardMaterial({
              map: faceTex || null,
              color: faceTex ? 0xffffff : 0x000000,
              transparent: !!isOverlay,
              alphaTest: isOverlay ? 0.1 : 0,
              opacity: faceTex ? 1 : 0,
              roughness: 1,
              metalness: 0,
              depthWrite: !isOverlay,
            }));
          }
          return mats;
        };

        if (!overlayFaceRects) {
          return new THREE.Mesh(new THREE.BoxGeometry(dim[0], dim[1], dim[2]), createMaterials(faceRects, false));
        }

        const group = new THREE.Group();
        const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(dim[0], dim[1], dim[2]), createMaterials(faceRects, false));
        group.add(baseMesh);

        const inflate = (0.5 / 16);
        const overlayMesh = new THREE.Mesh(
          new THREE.BoxGeometry(dim[0] + inflate, dim[1] + inflate, dim[2] + inflate),
          createMaterials(overlayFaceRects, true)
        );
        group.add(overlayMesh);
        return group;
      }

      function setupFirstPersonHandOverlay() {
        if (state.firstPersonHandEl) return;
        const hand = document.createElement('div');
        hand.id = 'firstperson-hand';

        const held = document.createElement('div');
        held.id = 'firstperson-held-item';

        resolvePlayerAssetPath('wieldhand.png', (wieldPath) => {
          if (wieldPath) {
            hand.style.backgroundImage = `url('${wieldPath}')`;
            hand.style.backgroundSize = '100% 100%';
            hand.style.backgroundPosition = 'center';
            hand.classList.remove('fallback');
            return;
          }
          resolvePlayerAssetPath('character.png', (skinPath) => {
            if (!skinPath) return;
            hand.style.backgroundImage = `url('${skinPath}')`;
            hand.style.backgroundSize = '64px 64px';
            hand.style.backgroundPosition = '-44px -20px';
            hand.classList.add('fallback');
          });
        });

        document.body.appendChild(held);
        document.body.appendChild(hand);
        state.firstPersonHandEl = hand;
        state.firstPersonHeldItemEl = held;
        syncRuntimeState();
      }

      function setupInventorySkinRig() {
        const preview = document.getElementById('inventory-skin-preview');
        if (!preview || state.inventorySkinRigEl) return;
        let skinPath = getPreferredPlayerAssetPath('character.png');

        const rig = document.createElement('div');
        rig.id = 'inventory-skin-rig';
        rig.innerHTML = `
          <div id="inv-skin-head" class="inv-skin-part"></div>
          <div id="inv-skin-body" class="inv-skin-part"></div>
          <div id="inv-skin-arm-left" class="inv-skin-part"></div>
          <div id="inv-skin-arm-right" class="inv-skin-part"></div>
          <div id="inv-skin-leg-left" class="inv-skin-part"></div>
          <div id="inv-skin-leg-right" class="inv-skin-part"></div>
        `;
        preview.innerHTML = '';
        preview.appendChild(rig);
        state.inventorySkinRigEl = rig;

        const setPart = (id, x, y, w, h) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.style.backgroundImage = `url('${skinPath}')`;
          el.style.backgroundPosition = `-${x}px -${y}px`;
          el.style.width = `${w}px`;
          el.style.height = `${h}px`;
        };

        const applyRigParts = () => {
          const modern = isModernSkinLayout();
          setPart('inv-skin-head', 8, 8, 8, 8);
          setPart('inv-skin-body', 20, 20, 8, 12);
          setPart('inv-skin-arm-left', ...(modern ? [36, 52, 4, 12] : [44, 20, 4, 12]));
          setPart('inv-skin-arm-right', 44, 20, 4, 12);
          setPart('inv-skin-leg-left', ...(modern ? [20, 52, 4, 12] : [4, 20, 4, 12]));
          setPart('inv-skin-leg-right', 4, 20, 4, 12);
        };

        applyRigParts();
        resolvePlayerAssetPath('character.png', (resolvedPath) => {
          if (!resolvedPath) return;
          skinPath = resolvedPath;
          applyRigParts();
        });
        ensureSteveSkinTextureLoaded().then(() => {
          applyRigParts();
        });
        syncRuntimeState();
      }

      function updateFirstPersonHand(time) {
        if (!state.firstPersonHandEl || !state.firstPersonHeldItemEl) return;
        const firstPerson = state.cameraViewMode === 0 && !getIsInventoryOpen();
        state.firstPersonHandEl.style.display = firstPerson ? 'block' : 'none';
        state.firstPersonHeldItemEl.style.display = firstPerson ? 'block' : 'none';
        if (!firstPerson) return;

        const moveSwing = player.isMoving ? Math.sin(time * 0.013) * 10 : 0;
        const miningSwingTimerMs = getMiningSwingTimerMs();
        const minePunch = miningSwingTimerMs > 0 ? (Math.sin((Math.max(0, 180 - miningSwingTimerMs) / 180) * Math.PI) * 20 - 9) : 0;
        const totalSwing = moveSwing + minePunch;
        state.firstPersonHandEl.style.transform = `translateY(${Math.max(-10, totalSwing)}px) rotate(${totalSwing * 0.36}deg)`;
        state.firstPersonHeldItemEl.style.transform = `translateY(${Math.max(-10, totalSwing)}px)`;

        const inventory = getInventory();
        const held = inventory[getSelectedHotbarIndex()];
        if (!held) {
          state.firstPersonHeldItemEl.innerHTML = '';
          return;
        }
        const blockMaterials = getBlockMaterials();
        const mat = blockMaterials[held.id];
        if (!mat) {
          state.firstPersonHeldItemEl.innerHTML = '';
          return;
        }
        const ASSET_FILEPATHS = getAssetFilepaths();
        if (mat.textured && mat.textureKey && ASSET_FILEPATHS[mat.textureKey]) {
          const src = ASSET_FILEPATHS[mat.textureKey];
          state.firstPersonHeldItemEl.innerHTML = `<img src="${src}" class="fp-held-icon" alt="held item" />`;
        } else {
          const colorHex = (mat.color ? mat.color.toString(16).padStart(6, '0') : '7f8c8d');
          state.firstPersonHeldItemEl.innerHTML = `<div class="fp-held-color" style="background:#${colorHex}"></div>`;
        }
      }

      function createPlayerAvatar() {
        const avatar = new THREE.Group();
        const U = 1 / 16;
        const head = createStevePartMesh([8 * U, 8 * U, 8 * U], getSkinPartRects('head', false), getSkinPartRects('head', true));
        head.position.y = 28 * U;
        const body = createStevePartMesh([8 * U, 12 * U, 4 * U], getSkinPartRects('body', false), getSkinPartRects('body', true));
        body.position.y = 18 * U;
        const rightArmPivot = new THREE.Group();
        rightArmPivot.position.set(6 * U, 24 * U, 0);
        const rightArm = createStevePartMesh([4 * U, 12 * U, 4 * U], getSkinPartRects('rightArm', false), getSkinPartRects('rightArm', true));
        rightArm.position.set(0, -6 * U, 0);
        rightArmPivot.add(rightArm);
        const leftArmPivot = new THREE.Group();
        leftArmPivot.position.set(-6 * U, 24 * U, 0);
        const leftArm = createStevePartMesh([4 * U, 12 * U, 4 * U], getSkinPartRects('leftArm', false), getSkinPartRects('leftArm', true));
        leftArm.position.set(0, -6 * U, 0);
        leftArmPivot.add(leftArm);
        const rightLegPivot = new THREE.Group();
        rightLegPivot.position.set(2 * U, 12 * U, 0);
        const rightLeg = createStevePartMesh([4 * U, 12 * U, 4 * U], getSkinPartRects('rightLeg', false), getSkinPartRects('rightLeg', true));
        rightLeg.position.set(0, -6 * U, 0);
        rightLegPivot.add(rightLeg);
        const leftLegPivot = new THREE.Group();
        leftLegPivot.position.set(-2 * U, 12 * U, 0);
        const leftLeg = createStevePartMesh([4 * U, 12 * U, 4 * U], getSkinPartRects('leftLeg', false), getSkinPartRects('leftLeg', true));
        leftLeg.position.set(0, -6 * U, 0);
        leftLegPivot.add(leftLeg);

        avatar.add(body, head, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot);
        state.playerAvatar = avatar;
        state.playerAvatarParts = { body, head, leftArm, rightArm, leftLeg, rightLeg, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot };
        syncRuntimeState();
        return avatar;
      }

      function applyCameraMode() {
        const camera = getCamera();
        if (!camera) return;
        if (state.cameraViewMode === 0) {
          camera.position.set(0, 0, 0);
          camera.rotation.y = 0;
          if (state.playerAvatar) state.playerAvatar.visible = false;
          if (state.firstPersonHandEl) state.firstPersonHandEl.style.display = 'block';
          if (state.firstPersonHeldItemEl) state.firstPersonHeldItemEl.style.display = 'block';
          showGameMessage('First-person view enabled');
        } else if (state.cameraViewMode === 1) {
          camera.position.set(0, 1.2, -2.6);
          camera.rotation.y = Math.PI;
          if (state.playerAvatar) state.playerAvatar.visible = true;
          if (state.firstPersonHandEl) state.firstPersonHandEl.style.display = 'none';
          if (state.firstPersonHeldItemEl) state.firstPersonHeldItemEl.style.display = 'none';
          showGameMessage('Second-person view enabled');
        } else {
          camera.position.set(0, 0.1, 3.6);
          camera.rotation.y = 0;
          if (state.playerAvatar) state.playerAvatar.visible = true;
          if (state.firstPersonHandEl) state.firstPersonHandEl.style.display = 'none';
          if (state.firstPersonHeldItemEl) state.firstPersonHeldItemEl.style.display = 'none';
          showGameMessage('Third-person view enabled');
        }
        syncRuntimeState();
      }

      function toggleCameraViewMode() {
        state.cameraViewMode = (state.cameraViewMode + 1) % 3;
        syncRuntimeState();
        applyCameraMode();
      }

      function updatePlayerAvatarVisuals(time) {
        if (!state.playerAvatarParts) return;
        const playerPrivileges = getPlayerPrivileges();
        const isFlyingPose = playerPrivileges.fly && getIsFlyActive();
        if (state.playerAvatar) {
          state.playerAvatar.rotation.x = (player.isSwimming || isFlyingPose) ? -Math.PI / 2 : 0;
          state.playerAvatar.rotation.z = 0;
        }
        if (isFlyingPose) {
          state.playerAvatarParts.leftLegPivot.rotation.x = 0;
          state.playerAvatarParts.rightLegPivot.rotation.x = 0;
          state.playerAvatarParts.leftArmPivot.rotation.x = 1.25;
          state.playerAvatarParts.rightArmPivot.rotation.x = -1.45;
        } else if (player.isSwimming) {
          const stroke = time * 0.02;
          const legKick = Math.sin(time * 0.028) * 0.25;
          state.playerAvatarParts.leftLegPivot.rotation.x = legKick;
          state.playerAvatarParts.rightLegPivot.rotation.x = -legKick;
          state.playerAvatarParts.leftArmPivot.rotation.x = stroke;
          state.playerAvatarParts.rightArmPivot.rotation.x = stroke + Math.PI;
        } else {
          const swing = player.isMoving ? Math.sin(time * 0.015) * 0.7 : 0;
          const miningSwingTimerMs = getMiningSwingTimerMs();
          const mineStroke = miningSwingTimerMs > 0 ? (Math.sin((Math.max(0, 180 - miningSwingTimerMs) / 180) * Math.PI) * 1.45 - 0.7) : 0;
          state.playerAvatarParts.leftLegPivot.rotation.x = swing;
          state.playerAvatarParts.rightLegPivot.rotation.x = -swing;
          state.playerAvatarParts.leftArmPivot.rotation.x = -swing * 0.75;
          state.playerAvatarParts.rightArmPivot.rotation.x = swing * 0.6 + mineStroke;
        }

        if (state.inventorySkinRigEl) {
          const swing = player.isMoving ? Math.sin(time * 0.015) * 0.7 : 0;
          const miningSwingTimerMs = getMiningSwingTimerMs();
          const mineStroke = miningSwingTimerMs > 0 ? (Math.sin((Math.max(0, 180 - miningSwingTimerMs) / 180) * Math.PI) * 1.45 - 0.7) : 0;
          const sdeg = swing * 40;
          const mineDeg = mineStroke * 50;
          const lLeg = document.getElementById('inv-skin-leg-left');
          const rLeg = document.getElementById('inv-skin-leg-right');
          const lArm = document.getElementById('inv-skin-arm-left');
          const rArm = document.getElementById('inv-skin-arm-right');
          if (lLeg) lLeg.style.transform = `rotate(${sdeg}deg)`;
          if (rLeg) rLeg.style.transform = `rotate(${-sdeg}deg)`;
          if (lArm) lArm.style.transform = `rotate(${-sdeg * 0.75}deg)`;
          if (rArm) rArm.style.transform = `rotate(${sdeg * 0.6 + mineDeg}deg)`;
        }
      }

      function toggleInventorySkinPreview() {
        if (state.skinSystem) {
          state.skinSystem.toggleInventorySkinPreview();
          return;
        }
        showGameMessage('Skin editor opened in preview mode');
        const preview = document.getElementById('inventory-skin-preview');
        if (!preview) return;
        preview.classList.toggle('active');
      }

      function updateSkinPreviewLook(clientX, clientY) {
        if (state.skinSystem) {
          state.skinSystem.updateSkinPreviewLook(clientX, clientY, getIsInventoryOpen());
          return;
        }
        const head = document.getElementById('inventory-skin-head');
        const wrap = document.getElementById('inventory-skin-preview');
        if (!head || !wrap || !getIsInventoryOpen()) return;
        const rect = wrap.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = Math.max(-1, Math.min(1, (clientX - cx) / (rect.width / 2)));
        const dy = Math.max(-1, Math.min(1, (clientY - cy) / (rect.height / 2)));
        head.style.setProperty('--skin-look-x', `${dx * 28}deg`);
        head.style.setProperty('--skin-look-y', `${-dy * 20}deg`);
      }

      function initSkinUi() {
        state.skinSystem = window.SingleplayerSkinSystem?.create({ showGameMessage }) || null;
        const editSkinBtn = document.getElementById('edit-skin-btn');
        const editSkinIcon = document.getElementById('edit-skin-icon');
        const assetBasePath = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || ''}/game/singleplayer/assets`;
        const editSkinIconPath = `${assetBasePath}/ui/inventory/edit_skin_button.png`;
        if (editSkinIcon) editSkinIcon.src = editSkinIconPath;
        if (editSkinBtn) {
          editSkinBtn.addEventListener('click', () => {
            window.location.href = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || '/MultiPixel'}/game/singleplayer/edit/index.html`;
          });
        }
        setupFirstPersonHandOverlay();
        setupInventorySkinRig();
        syncRuntimeState();
      }

      function getPlayerAvatar() {
        return state.playerAvatar;
      }

      syncRuntimeState();

      return {
        ensureSteveSkinTextureLoaded,
        getSteveSkinTexture,
        getPlayerAssetCandidates,
        getPreferredPlayerAssetPath,
        createSkinFaceTexture,
        isModernSkinLayout,
        buildPartFaceRects,
        getSkinPartRects,
        createStevePartMesh,
        setupFirstPersonHandOverlay,
        setupInventorySkinRig,
        updateFirstPersonHand,
        createPlayerAvatar,
        applyCameraMode,
        toggleCameraViewMode,
        updatePlayerAvatarVisuals,
        toggleInventorySkinPreview,
        updateSkinPreviewLook,
        initSkinUi,
        getPlayerAvatar,
      };
    }
  };

  window.SingleplayerDefaultSkin = SingleplayerDefaultSkin;
})();
