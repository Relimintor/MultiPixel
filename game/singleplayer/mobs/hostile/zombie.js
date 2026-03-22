(function () {
  const root = (window.SingleplayerMobData = window.SingleplayerMobData || {
    categories: { passive: {}, neutral: {}, hostile: {} },
  });

  root.categories.hostile.zombie = {
    id: 2,
    key: 'zombie',
    name: 'Zombie',
    category: 'hostile',
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

  window.SingleplayerZombieMob = {
    create({
      THREE,
      getScene,
      CHUNK_HEIGHT,
      getYawObject,
      getLightingSystem,
      getTimePhaseInfo,
      getRaycaster,
      prepareCrosshairRaycast,
      getSurfaceYForEntity,
      getBlockType,
      isLiquid,
      isSolid,
      isEntityActiveAt,
      applyMobCommandHeight,
      applyHitFeedback,
      tickMobHitFeedback,
      takeDamage,
      addToInventory,
      showGameMessage,
    }) {
      const entities = [];
      let zombieTexture = null;
      let zombieSpawnTimerMs = 0;

      async function loadTexture() {
        const path = window.SingleplayerConfig?.ASSET_FILEPATHS?.ZOMBIE_TEXTURE;
        if (!path) return;
        zombieTexture = await new Promise((resolve) => {
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
        if (partName === 'head') return buildMobPartFaceRects(0, 0, 8, 8, 8);
        if (partName === 'body') return buildMobPartFaceRects(16, 16, 8, 12, 4);
        if (partName === 'rightArm') return buildMobPartFaceRects(40, 16, 4, 12, 4);
        if (partName === 'leftArm') return buildMobPartFaceRects(32, 48, 4, 12, 4);
        if (partName === 'rightLeg') return buildMobPartFaceRects(0, 16, 4, 12, 4);
        if (partName === 'leftLeg') return buildMobPartFaceRects(16, 48, 4, 12, 4);
        return null;
      }

      function createPart(dim, rects) {
        const mats = [];
        for (let i = 0; i < 6; i++) {
          const faceTex = createAtlasFaceTexture(THREE, zombieTexture, rects[i], 64, 64);
          mats.push(new THREE.MeshStandardMaterial({ map: faceTex || null, color: faceTex ? 0xffffff : 0x72b86a, roughness: 0.88 }));
        }
        return new THREE.Mesh(new THREE.BoxGeometry(dim[0], dim[1], dim[2]), mats);
      }

      function createMesh() {
        const U = 1 / 16;
        const root = new THREE.Group();

        const body = createPart([8 * U, 12 * U, 4 * U], getPartRects('body'));
        body.position.y = 18 * U;
        root.add(body);

        const head = createPart([8 * U, 8 * U, 8 * U], getPartRects('head'));
        head.position.y = 28 * U;
        root.add(head);

        const rightArmPivot = new THREE.Group();
        rightArmPivot.position.set(6 * U, 24 * U, 0);
        const rightArm = createPart([4 * U, 12 * U, 4 * U], getPartRects('rightArm'));
        rightArm.position.set(0, -6 * U, 0);
        rightArmPivot.add(rightArm);

        const leftArmPivot = new THREE.Group();
        leftArmPivot.position.set(-6 * U, 24 * U, 0);
        const leftArm = createPart([4 * U, 12 * U, 4 * U], getPartRects('leftArm'));
        leftArm.position.set(0, -6 * U, 0);
        leftArmPivot.add(leftArm);

        const rightLegPivot = new THREE.Group();
        rightLegPivot.position.set(2 * U, 12 * U, 0);
        const rightLeg = createPart([4 * U, 12 * U, 4 * U], getPartRects('rightLeg'));
        rightLeg.position.set(0, -6 * U, 0);
        rightLegPivot.add(rightLeg);

        const leftLegPivot = new THREE.Group();
        leftLegPivot.position.set(-2 * U, 12 * U, 0);
        const leftLeg = createPart([4 * U, 12 * U, 4 * U], getPartRects('leftLeg'));
        leftLeg.position.set(0, -6 * U, 0);
        leftLegPivot.add(leftLeg);

        root.add(leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot);

        const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hitbox.position.set(0, 0.9, 0);
        hitbox.userData.zombieHitbox = true;
        root.add(hitbox);
        root.userData.zombieHitbox = hitbox;
        root.userData.zombieParts = { head, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot };
        return root;
      }

      function canSeeSky(wx, wy, wz) {
        for (let y = wy + 1; y < CHUNK_HEIGHT; y++) {
          const b = getBlockType(wx, y, wz);
          if (b !== 0 && !isLiquid(b)) return false;
        }
        return true;
      }

      function findSpawnY(wx, wz) {
        const x = Math.floor(wx);
        const z = Math.floor(wz);
        for (let y = CHUNK_HEIGHT - 3; y >= 2; y--) {
          const under = getBlockType(x, y - 1, z);
          const feet = getBlockType(x, y, z);
          const head = getBlockType(x, y + 1, z);
          if (!isSolid(under) || isLiquid(under) || under === 6) continue;
          if (feet !== 0 || head !== 0) continue;
          const lightingSystem = getLightingSystem?.();
          const skyLightLevel = lightingSystem ? lightingSystem.getSkyLightLevel(x, y, z) : 0;
          if (skyLightLevel > 7) continue;
          const blockLightLevel = lightingSystem ? lightingSystem.getBlockLightLevel(x, y, z) : 0;
          if (blockLightLevel > 7) continue;
          if (lightingSystem && lightingSystem.hasNearbyBlockLightSource(x, y, z, 7)) continue;
          return y;
        }
        return -1;
      }

      function spawnAt(wx, wz, heightBlocks = null) {
        const y = findSpawnY(wx, wz);
        if (y <= 0) return false;
        const under = getBlockType(Math.floor(wx), y - 1, Math.floor(wz));
        if (under === 0 || isLiquid(under)) return false;
        const root = createMesh();
        applyMobCommandHeight(root, heightBlocks, 1.8);
        root.position.set(Math.floor(wx) + 0.5, y, Math.floor(wz) + 0.5);
        getScene?.()?.add(root);
        entities.push({
          root,
          hp: 20,
          attackCooldownMs: 0,
          attackReach: 1.2 + Math.random() * 0.5,
          burnTickMs: 0,
          inDirectSunlight: false,
          sunProbeMs: 0,
          targetY: y,
          groundProbeMs: 0,
          knockbackVX: 0,
          knockbackVZ: 0,
          hitFlashMs: 0,
        });
        return true;
      }

      function getHitFromCrosshair() {
        if (!entities.length) return null;
        if (!prepareCrosshairRaycast()) return null;
        const raycaster = getRaycaster?.();
        if (!raycaster) return null;
        const hitboxes = entities.map((z) => z.root.userData.zombieHitbox).filter(Boolean);
        const hits = raycaster.intersectObjects(hitboxes, false);
        if (!hits.length) return null;
        const hitObj = hits[0].object;
        return entities.find((z) => z.root.userData.zombieHitbox === hitObj) || null;
      }

      function hurt(zombie, amount = 4, sourcePos = null, extraKnockback = 0) {
        if (!zombie) return;
        applyHitFeedback(zombie, sourcePos, amount, extraKnockback);
        zombie.hp -= amount;
        if (zombie.hp > 0) return;
        const idx = entities.indexOf(zombie);
        if (idx >= 0) entities.splice(idx, 1);
        getScene?.()?.remove(zombie.root);
        const drops = 1 + Math.floor(Math.random() * 2);
        addToInventory?.(92, drops);
        showGameMessage?.(`+${drops} Rotten Flesh`);
      }

      function trySpawnNight(deltaMs) {
        const phase = getTimePhaseInfo?.()?.phase;
        if (phase !== 'Night') return;
        zombieSpawnTimerMs -= deltaMs;
        if (zombieSpawnTimerMs > 0) return;
        zombieSpawnTimerMs = 2200 + Math.random() * 3200;
        if (entities.length >= 8) return;
        const yawObject = getYawObject?.();
        if (!yawObject) return;
        const angle = Math.random() * Math.PI * 2;
        const dist = 14 + Math.random() * 20;
        const wx = yawObject.position.x + Math.cos(angle) * dist;
        const wz = yawObject.position.z + Math.sin(angle) * dist;
        spawnAt(wx, wz);
      }

      function isInDirectSunlight(wx, wy, wz) {
        const lightingSystem = getLightingSystem?.();
        if (!lightingSystem) return canSeeSky(wx, wy, wz);
        if (!lightingSystem.isOpenToSky(wx, wy, wz)) return false;
        const skyLight = lightingSystem.getSkyLightLevel(wx, wy, wz);
        return skyLight >= 12;
      }

      function update(time, deltaMs) {
        if (!entities.length) return;
        const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
        const phase = getTimePhaseInfo?.()?.phase;
        const burningTime = phase === 'Day' || phase === 'Sunrise';
        const yawObject = getYawObject?.();
        if (!yawObject) return;
        const playerPos = yawObject.position;

        for (let i = entities.length - 1; i >= 0; i--) {
          const z = entities[i];
          if (!isEntityActiveAt(z.root.position)) continue;
          tickMobHitFeedback(z, deltaMs);
          const toPlayerFlat = new THREE.Vector3(playerPos.x - z.root.position.x, 0, playerPos.z - z.root.position.z);
          const distFlat = toPlayerFlat.length();
          if (distFlat > 0.001) toPlayerFlat.normalize();
          const dy = (playerPos.y + 0.9) - (z.root.position.y + 0.9);
          const dist3D = Math.hypot(distFlat, dy);

          const speed = 1.18;
          const nx = z.root.position.x + toPlayerFlat.x * speed * dt;
          const nz = z.root.position.z + toPlayerFlat.z * speed * dt;

          z.groundProbeMs -= deltaMs;
          if (z.groundProbeMs <= 0) {
            z.groundProbeMs = 180;
            z.targetY = getSurfaceYForEntity(nx, nz, z.targetY);
          }

          if (z.targetY > 0) {
            z.root.position.x = nx;
            z.root.position.z = nz;
            z.root.position.y += (z.targetY - z.root.position.y) * Math.min(1, dt * 12);
          }

          if (distFlat > 0.1) z.root.rotation.y = Math.atan2(toPlayerFlat.x, toPlayerFlat.z);

          const parts = z.root.userData.zombieParts;
          if (parts) {
            const walk = Math.sin(time * 0.01 + i) * 0.52;
            parts.leftLegPivot.rotation.x = walk;
            parts.rightLegPivot.rotation.x = -walk;
            const armSwing = Math.sin(time * 0.01 + i + Math.PI * 0.2) * 0.20;
            parts.leftArmPivot.rotation.x = -1.35 + armSwing;
            parts.rightArmPivot.rotation.x = -1.35 - armSwing;
          }

          z.attackCooldownMs = Math.max(0, z.attackCooldownMs - deltaMs);
          if (dist3D < (z.attackReach || 1.35) && z.attackCooldownMs <= 0) {
            z.attackCooldownMs = 2000;
            takeDamage?.(3, { source: 'mob', sourcePos: z.root.position, knockbackStrength: 0.28 });
          }

          const zx = Math.floor(z.root.position.x);
          const zy = Math.floor(z.root.position.y + 1.6);
          const zz = Math.floor(z.root.position.z);
          const inLiquid = isLiquid(getBlockType(zx, zy, zz));

          z.sunProbeMs = (z.sunProbeMs ?? 0) - deltaMs;
          if (z.sunProbeMs <= 0) {
            z.sunProbeMs = 220;
            z.inDirectSunlight = isInDirectSunlight(zx, zy, zz);
          }

          if (burningTime && z.inDirectSunlight && !inLiquid) {
            z.burnTickMs = (z.burnTickMs ?? 0) - deltaMs;
            if (z.burnTickMs <= 0) {
              z.burnTickMs = 900;
              hurt(z, 2, null);
            }
          } else {
            z.burnTickMs = 0;
          }
        }
      }

      return {
        getEntities: () => entities,
        loadTexture,
        spawnAt,
        getHitFromCrosshair,
        hurt,
        trySpawnNight,
        update,
      };
    },
  };
})();
