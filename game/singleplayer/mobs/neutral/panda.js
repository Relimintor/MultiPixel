(function () {
  const root = (window.SingleplayerMobData = window.SingleplayerMobData || {
    categories: { passive: {}, neutral: {}, hostile: {} },
  });

  root.categories.neutral.panda = {
    id: 4,
    key: 'panda',
    name: 'Panda',
    category: 'neutral',
  };

  function createAtlasFaceTexture(THREE, baseTex, rect, atlasW, atlasH) {
    if (!baseTex || !rect) return null;
    const [x, y, w, h] = rect;
    const tex = baseTex.clone();
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

  function buildMobPartFaceRects(x, y, w, h, d) {
    return {
      0: [x, y + d, w, h],
      1: [x + w + d, y + d, w, h],
      2: [x + w, y, w, d],
      3: [x + w + d, y, w, d],
      4: [x + w, y + d, w, h],
      5: [x + (w * 2) + d, y + d, w, h],
    };
  }

  window.SingleplayerPandaMob = {
    create({
      THREE,
      getScene,
      getYawObject,
      getRaycaster,
      prepareCrosshairRaycast,
      getSurfaceYForEntity,
      isEntityActiveAt,
      applyMobCommandHeight,
      applyHitFeedback,
      tickMobHitFeedback,
      showGameMessage,
      addToInventory,
      takeDamage,
    }) {
      const entities = [];
      let pandaTexture = null;

      async function loadTexture() {
        const path = window.SingleplayerConfig?.ASSET_FILEPATHS?.PANDA_TEXTURE;
        if (!path) return;
        pandaTexture = await new Promise((resolve) => {
          new THREE.TextureLoader().load(path, (t) => {
            t.magFilter = THREE.NearestFilter;
            t.minFilter = THREE.NearestFilter;
            t.flipY = false;
            t.wrapS = THREE.ClampToEdgeWrapping;
            t.wrapT = THREE.ClampToEdgeWrapping;
            resolve(t);
          }, undefined, () => resolve(null));
        });
      }

      function getPartRects(partName) {
        if (partName === 'head') return buildMobPartFaceRects(0, 0, 13, 10, 9);
        if (partName === 'body') return buildMobPartFaceRects(0, 19, 19, 12, 9);
        if (partName === 'leg') return buildMobPartFaceRects(0, 47, 6, 9, 6);
        return null;
      }

      function createPart(dim, rects) {
        const mats = [];
        for (let i = 0; i < 6; i++) {
          const faceTex = createAtlasFaceTexture(THREE, pandaTexture, rects[i], 64, 64);
          mats.push(new THREE.MeshStandardMaterial({ map: faceTex || null, color: faceTex ? 0xffffff : 0xf2f2f2, roughness: 0.88 }));
        }
        return new THREE.Mesh(new THREE.BoxGeometry(dim[0], dim[1], dim[2]), mats);
      }

      function createMesh() {
        const U = 1 / 16;
        const panda = new THREE.Group();

        const body = createPart([19 * U, 12 * U, 13 * U], getPartRects('body'));
        body.position.y = 11 * U;
        panda.add(body);

        const head = createPart([13 * U, 10 * U, 9 * U], getPartRects('head'));
        head.position.set(0, 14 * U, 9.5 * U);
        panda.add(head);

        const earMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.9 });
        const leftEar = new THREE.Mesh(new THREE.BoxGeometry(2 * U, 2 * U, 2 * U), earMat);
        const rightEar = leftEar.clone();
        leftEar.position.set(-4 * U, 20 * U, 6 * U);
        rightEar.position.set(4 * U, 20 * U, 6 * U);
        panda.add(leftEar, rightEar);

        const legOffsets = [[-6 * U, 4.5 * U, 4 * U], [6 * U, 4.5 * U, 4 * U], [-6 * U, 4.5 * U, -4 * U], [6 * U, 4.5 * U, -4 * U]];
        const legs = [];
        for (const off of legOffsets) {
          const leg = createPart([6 * U, 9 * U, 6 * U], getPartRects('leg'));
          leg.position.set(off[0], off[1], off[2]);
          panda.add(leg);
          legs.push(leg);
        }

        const hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hitbox.position.set(0, 0.6, 0);
        hitbox.userData.pandaHitbox = true;
        panda.add(hitbox);
        panda.userData.pandaHitbox = hitbox;
        panda.userData.pandaHead = head;
        panda.userData.pandaLegs = legs;
        return panda;
      }

      function spawnAt(wx, wz, heightBlocks = null) {
        const y = getSurfaceYForEntity(wx, wz);
        if (y <= 0) return false;
        return spawnAtExact(wx, y, wz, heightBlocks);
      }

      function spawnAtExact(wx, y, wz, heightBlocks = null) {
        const root = createMesh();
        applyMobCommandHeight(root, heightBlocks, 1.15);
        root.position.set(Math.floor(wx) + 0.5, y, Math.floor(wz) + 0.5);
        getScene?.()?.add(root);
        entities.push({
          root,
          hp: 16,
          dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
          changeDirMs: 900 + Math.random() * 1400,
          bobPhase: Math.random() * Math.PI * 2,
          targetY: y,
          groundProbeMs: 0,
          attackCooldownMs: 0,
          angerUntilMs: 0,
          invulnerable: false,
        });
        return true;
      }

      function spawnInitial() {
        let spawned = 0;
        for (let i = 0; i < 220 && spawned < 8; i++) {
          const yawObject = getYawObject?.();
          if (!yawObject) break;
          const wx = yawObject.position.x + (Math.random() - 0.5) * 64;
          const wz = yawObject.position.z + (Math.random() - 0.5) * 64;
          if (spawnAt(wx, wz)) spawned++;
        }
      }

      function spawnForCommand(wx, wz, heightBlocks = null) {
        if (spawnAt(wx, wz, heightBlocks)) return true;
        const y = getSurfaceYForEntity(wx, wz, 72);
        if (y <= 0) return false;
        return spawnAtExact(wx, y, wz, heightBlocks);
      }

      function getHitFromCrosshair() {
        if (!entities.length) return null;
        if (!prepareCrosshairRaycast()) return null;
        const raycaster = getRaycaster?.();
        if (!raycaster) return null;
        const hitboxes = entities.map((p) => p.root.userData.pandaHitbox).filter(Boolean);
        const hits = raycaster.intersectObjects(hitboxes, false);
        if (!hits.length) return null;
        const hitObj = hits[0].object;
        return entities.find((p) => p.root.userData.pandaHitbox === hitObj) || null;
      }

      function hurt(panda, amount = 4, source = 'player', sourcePos = null, extraKnockback = 0) {
        if (!panda) return;
        if (panda.invulnerable) {
          if (source === 'player') showGameMessage?.('XREALM is unkillable.');
          panda.changeDirMs = 0;
          panda.angerUntilMs = performance.now() + (window.JungleDecorationConfig?.panda?.angerMsOnHit || 6000);
          return;
        }
        applyHitFeedback(panda, sourcePos, amount, extraKnockback);
        panda.hp -= amount;
        if (panda.hp > 0) {
          panda.changeDirMs = 0;
          panda.angerUntilMs = performance.now() + (window.JungleDecorationConfig?.panda?.angerMsOnHit || 6000);
          if (source === 'player') showGameMessage?.('Panda: huff!');
          return;
        }
        const idx = entities.indexOf(panda);
        if (idx >= 0) entities.splice(idx, 1);
        getScene?.()?.remove(panda.root);
        const drops = 1 + Math.floor(Math.random() * 2);
        addToInventory?.(101, drops);
        showGameMessage?.(`+${drops} Bamboo Stalk`);
      }

      function update(time, deltaMs) {
        if (!entities.length) return;
        const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
        const yawObject = getYawObject?.();
        if (!yawObject) return;
        const playerPos = yawObject.position;
        for (let i = entities.length - 1; i >= 0; i--) {
          const panda = entities[i];
          if (!isEntityActiveAt(panda.root.position)) continue;
          tickMobHitFeedback(panda, deltaMs);
          panda.changeDirMs -= deltaMs;
          panda.attackCooldownMs = Math.max(0, panda.attackCooldownMs - deltaMs);
          const angry = performance.now() < panda.angerUntilMs;
          if (angry) {
            const toPlayer = new THREE.Vector3(playerPos.x - panda.root.position.x, 0, playerPos.z - panda.root.position.z);
            const d = toPlayer.length();
            if (d > 0.001) {
              toPlayer.normalize();
              panda.dir.copy(toPlayer);
            }
            if (d < 1.45 && panda.attackCooldownMs <= 0) {
              panda.attackCooldownMs = 850;
              takeDamage?.(2);
            }
          } else if (panda.changeDirMs <= 0) {
            panda.changeDirMs = 1000 + Math.random() * 1800;
            panda.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          }

          const speed = angry ? 1.0 : 0.72;
          const nx = panda.root.position.x + panda.dir.x * speed * dt;
          const nz = panda.root.position.z + panda.dir.z * speed * dt;

          panda.groundProbeMs -= deltaMs;
          if (panda.groundProbeMs <= 0) {
            panda.groundProbeMs = 180;
            panda.targetY = getSurfaceYForEntity(nx, nz, panda.targetY);
          }
          if (panda.targetY > 0) {
            panda.root.position.x = nx;
            panda.root.position.z = nz;
            panda.root.position.y += (panda.targetY - panda.root.position.y) * Math.min(1, dt * 10);
          }
          panda.root.rotation.y = Math.atan2(panda.dir.x, panda.dir.z);

          const legs = panda.root.userData.pandaLegs || [];
          const walk = Math.sin(time * 0.01 + panda.bobPhase) * (angry ? 0.32 : 0.2);
          if (legs[0]) legs[0].rotation.x = walk;
          if (legs[1]) legs[1].rotation.x = -walk;
          if (legs[2]) legs[2].rotation.x = -walk;
          if (legs[3]) legs[3].rotation.x = walk;
        }
      }

      return {
        getEntities: () => entities,
        loadTexture,
        spawnAt,
        spawnAtExact,
        spawnInitial,
        spawnForCommand,
        getHitFromCrosshair,
        hurt,
        update,
      };
    },
  };
})();
