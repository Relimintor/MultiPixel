(function () {
  const root = (window.SingleplayerMobData = window.SingleplayerMobData || {
    categories: { passive: {}, neutral: {}, hostile: {} },
  });

  root.categories.passive.pig = {
    id: 1,
    key: 'pig',
    name: 'Pig',
    category: 'passive',
    behavior: {
      goals: [
        { priority: 0, key: 'float', label: 'FloatGoal', description: 'Keeps pig afloat in water or lava' },
        { priority: 1, key: 'panic', label: 'PanicGoal', description: 'Runs away when hurt, burning, or scared' },
        { priority: 3, key: 'breed', label: 'BreedGoal', description: 'Moves to another pig to breed' },
        { priority: 4, key: 'tempt', label: 'TemptGoal', description: 'Follows players holding carrot, potato, or beetroot' },
        { priority: 5, key: 'followParent', label: 'FollowParentGoal', description: 'Baby pigs follow adults' },
        { priority: 6, key: 'stroll', label: 'WaterAvoidingRandomStrollGoal', description: 'Random wandering while avoiding water' },
        { priority: 7, key: 'lookAtPlayer', label: 'LookAtPlayerGoal', description: 'Looks at nearby players' },
        { priority: 8, key: 'idleLook', label: 'RandomLookAroundGoal', description: 'Idle head movement' },
      ],
      temptItems: ['carrot', 'potato', 'beetroot'],
    },
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

  window.SingleplayerPigMob = {
    create({
      THREE,
      getScene,
      getYawObject,
      getInventory,
      getSelectedHotbarIndex,
      getLightingSystem,
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
      showGameMessage,
      canSpawnMob,
      despawnDistance = 70,
    }) {
      const entities = [];
      const pigMobDef = window.SingleplayerMobData?.categories?.passive?.pig || null;
      const pigGoalPriority = Array.isArray(pigMobDef?.behavior?.goals)
        ? [...pigMobDef.behavior.goals].sort((a, b) => a.priority - b.priority)
        : [];
      let pigTexture = null;

      async function loadTexture() {
        const path = window.SingleplayerConfig?.ASSET_FILEPATHS?.PIG_TEXTURE;
        if (!path) return;
        pigTexture = await new Promise((resolve) => {
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

      function createPigPart(dim, rects) {
        const mats = [];
        for (let i = 0; i < 6; i++) {
          const faceTex = createAtlasFaceTexture(THREE, pigTexture, rects[i], 64, 32);
          mats.push(new THREE.MeshStandardMaterial({ map: faceTex || null, color: faceTex ? 0xffffff : 0xe8b6b8, roughness: 0.92 }));
        }
        return new THREE.Mesh(new THREE.BoxGeometry(dim[0], dim[1], dim[2]), mats);
      }

      function createMesh() {
        const U = 1 / 16;
        const pig = new THREE.Group();

        const body = createPigPart([10 * U, 8 * U, 16 * U], buildMobPartFaceRects(28, 8, 10, 8, 16));
        body.position.y = 10 * U;
        pig.add(body);

        const head = createPigPart([8 * U, 8 * U, 8 * U], buildMobPartFaceRects(0, 0, 8, 8, 8));
        head.position.set(0, 11 * U, 10 * U);
        pig.add(head);

        const legRects = buildMobPartFaceRects(0, 16, 4, 6, 4);
        const legOffsets = [[-3 * U, 3 * U, 5 * U], [3 * U, 3 * U, 5 * U], [-3 * U, 3 * U, -5 * U], [3 * U, 3 * U, -5 * U]];
        const legs = [];
        for (const off of legOffsets) {
          const leg = createPigPart([4 * U, 6 * U, 4 * U], legRects);
          leg.position.set(off[0], off[1], off[2]);
          pig.add(leg);
          legs.push(leg);
        }

        const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 1.0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hitbox.position.set(0, 0.5, 0);
        hitbox.userData.pigHitbox = true;
        pig.add(hitbox);
        pig.userData.pigHitbox = hitbox;
        pig.userData.pigHead = head;
        pig.userData.pigLegs = legs;
        return pig;
      }

      function spawnAt(wx, wz, heightBlocks = null) {
        if (canSpawnMob && !canSpawnMob()) return false;
        const y = getSurfaceYForEntity(wx, wz);
        if (y < 62 || y > 86) return false;
        const under = getBlockType(Math.floor(wx), y - 1, Math.floor(wz));
        if (under !== 1 && under !== 2) return false;
        const lightingSystem = getLightingSystem?.();
        const lightLevel = lightingSystem ? lightingSystem.getCombinedLight(Math.floor(wx), y, Math.floor(wz)) : 15;
        if (lightLevel < 9) return false;
        return spawnAtExact(wx, y, wz, heightBlocks);
      }

      function spawnAtExact(wx, y, wz, heightBlocks = null) {
        const pigRoot = createMesh();
        applyMobCommandHeight(pigRoot, heightBlocks, 0.9);
        pigRoot.position.set(Math.floor(wx) + 0.5, y, Math.floor(wz) + 0.5);
        getScene?.()?.add(pigRoot);
        entities.push({
          root: pigRoot,
          hp: 10,
          dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
          changeDirMs: 400 + Math.random() * 1200,
          bobPhase: Math.random() * Math.PI * 2,
          targetY: y,
          groundProbeMs: 0,
          lookYaw: 0,
          lookPitch: 0,
          lookTargetYaw: 0,
          lookTargetPitch: 0,
          nextLookChangeMs: 0,
          panicUntilMs: 0,
        });
        return true;
      }

      function spawnInitial() {
        let spawned = 0;
        for (let i = 0; i < 120 && spawned < 10; i++) {
          const yawObject = getYawObject?.();
          if (!yawObject) break;
          const wx = yawObject.position.x + (Math.random() - 0.5) * 36;
          const wz = yawObject.position.z + (Math.random() - 0.5) * 36;
          if (spawnAt(wx, wz)) spawned++;
        }
      }

      function findTemptDirection(pig) {
        const inventory = getInventory?.() || [];
        const selectedHotbarIndex = getSelectedHotbarIndex?.() || 0;
        const held = inventory[selectedHotbarIndex] || null;
        const temptItems = new Set((pigMobDef?.behavior?.temptItems || []).map((item) => String(item).toLowerCase()));
        const heldName = String(held?.name || held?.label || held?.id || '').toLowerCase();
        if (!temptItems.size || !heldName || !temptItems.has(heldName)) return null;
        const yawObject = getYawObject?.();
        if (!yawObject) return null;
        const toPlayer = new THREE.Vector3(yawObject.position.x - pig.root.position.x, 0, yawObject.position.z - pig.root.position.z);
        if (toPlayer.lengthSq() < 0.0001 || toPlayer.length() > 8) return null;
        return toPlayer.normalize();
      }

      function choosePriorityGoal(pig, nowMs, nx, nz) {
        const inLiquid = isLiquid(getBlockType(Math.floor(pig.root.position.x), Math.floor(pig.root.position.y), Math.floor(pig.root.position.z)));
        const panicActive = pig.panicUntilMs > nowMs;
        const temptDir = findTemptDirection(pig);
        for (const goal of pigGoalPriority) {
          if (goal.key === 'float' && inLiquid) {
            return { key: goal.key, speed: 1.2, dir: pig.dir.clone(), forceRaise: true, avoidWater: false };
          }
          if (goal.key === 'panic' && panicActive) {
            return { key: goal.key, speed: 1.35, dir: pig.dir.clone(), forceRaise: false, avoidWater: true };
          }
          if (goal.key === 'tempt' && temptDir) {
            return { key: goal.key, speed: 0.95, dir: temptDir, forceRaise: false, avoidWater: true, lookAtPlayer: true };
          }
          if (goal.key === 'stroll') {
            const nextBlock = getBlockType(Math.floor(nx), Math.floor(pig.root.position.y), Math.floor(nz));
            if (isLiquid(nextBlock)) {
              const turnDir = new THREE.Vector3(-pig.dir.z, 0, pig.dir.x);
              if (turnDir.lengthSq() > 0.00001) turnDir.normalize();
              return { key: goal.key, speed: 0.75, dir: turnDir, forceRaise: false, avoidWater: true };
            }
            return { key: goal.key, speed: 0.75, dir: pig.dir.clone(), forceRaise: false, avoidWater: true };
          }
          if (goal.key === 'lookAtPlayer') {
            const yawObject = getYawObject?.();
            if (!yawObject) continue;
            const toPlayer = new THREE.Vector3(yawObject.position.x - pig.root.position.x, 0, yawObject.position.z - pig.root.position.z);
            if (toPlayer.length() < 5.5) {
              return { key: goal.key, speed: 0.55, dir: pig.dir.clone(), forceRaise: false, avoidWater: true, idleLook: true };
            }
          }
        }
        return { key: 'default', speed: 0.75, dir: pig.dir.clone(), forceRaise: false, avoidWater: true };
      }

      function update(time, deltaMs) {
        if (!entities.length) return;
        const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
        const nowMs = performance.now();
        const yawObject = getYawObject?.();
        if (!yawObject) return;

        for (let i = entities.length - 1; i >= 0; i--) {
          const pig = entities[i];
          const distToPlayer = pig.root.position.distanceTo(yawObject.position);
          if (distToPlayer > despawnDistance) {
            entities.splice(i, 1);
            getScene?.()?.remove(pig.root);
            continue;
          }
          if (!isEntityActiveAt(pig.root.position)) continue;
          tickMobHitFeedback(pig, deltaMs);
          pig.changeDirMs -= deltaMs;
          if (pig.changeDirMs <= 0) {
            pig.changeDirMs = 900 + Math.random() * 1800;
            pig.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          }

          const probeNx = pig.root.position.x + pig.dir.x * 0.75 * dt;
          const probeNz = pig.root.position.z + pig.dir.z * 0.75 * dt;
          const activeGoal = choosePriorityGoal(pig, nowMs, probeNx, probeNz);
          if (activeGoal?.dir?.lengthSq() > 0.000001) pig.dir.copy(activeGoal.dir.normalize());

          const speed = Number(activeGoal?.speed) || 0.75;
          const nx = pig.root.position.x + pig.dir.x * speed * dt;
          const nz = pig.root.position.z + pig.dir.z * speed * dt;

          pig.groundProbeMs -= deltaMs;
          if (pig.groundProbeMs <= 0) {
            pig.groundProbeMs = 220 + Math.random() * 180;
            pig.targetY = getSurfaceYForEntity(nx, nz, pig.targetY);
          }

          if (activeGoal?.forceRaise) {
            pig.targetY = Math.max(pig.targetY, pig.root.position.y + 0.065);
          }

          if (pig.targetY > 0) {
            pig.root.position.x = nx;
            pig.root.position.z = nz;
            pig.root.position.y += (pig.targetY - pig.root.position.y) * Math.min(1, dt * (activeGoal?.forceRaise ? 14 : 10));
          }
          pig.root.rotation.y = Math.atan2(pig.dir.x, pig.dir.z);

          if (activeGoal?.lookAtPlayer) {
            const toPlayer = new THREE.Vector3(yawObject.position.x - pig.root.position.x, yawObject.position.y + 1.4 - pig.root.position.y, yawObject.position.z - pig.root.position.z);
            const yaw = Math.atan2(toPlayer.x, toPlayer.z) - pig.root.rotation.y;
            const pitch = Math.atan2(toPlayer.y, Math.max(0.001, Math.hypot(toPlayer.x, toPlayer.z)));
            pig.lookTargetYaw = Math.max(-0.55, Math.min(0.55, yaw));
            pig.lookTargetPitch = Math.max(-0.3, Math.min(0.3, pitch));
            pig.nextLookChangeMs = 0;
          } else {
            pig.nextLookChangeMs -= deltaMs;
            if (pig.nextLookChangeMs <= 0) {
              pig.nextLookChangeMs = 700 + Math.random() * 1400;
              pig.lookTargetYaw = (Math.random() - 0.5) * 0.8;
              pig.lookTargetPitch = (Math.random() - 0.5) * 0.26;
            }
          }

          pig.lookYaw += (pig.lookTargetYaw - pig.lookYaw) * Math.min(1, dt * 6);
          pig.lookPitch += (pig.lookTargetPitch - pig.lookPitch) * Math.min(1, dt * 6);

          const head = pig.root.userData.pigHead;
          if (head) {
            head.rotation.y = pig.lookYaw;
            head.rotation.x = pig.lookPitch;
          }

          const moving = speed > 0.6;
          const swing = moving ? Math.sin(time * 0.008 + pig.bobPhase) * 0.17 : 0;
          const legs = pig.root.userData.pigLegs || [];
          if (legs[0]) legs[0].rotation.x = swing;
          if (legs[1]) legs[1].rotation.x = -swing;
          if (legs[2]) legs[2].rotation.x = -swing;
          if (legs[3]) legs[3].rotation.x = swing;
        }
      }

      function getHitFromCrosshair() {
        if (!entities.length) return null;
        if (!prepareCrosshairRaycast()) return null;
        const raycaster = getRaycaster?.();
        if (!raycaster) return null;
        const hitboxes = entities.map((p) => p.root.userData.pigHitbox).filter(Boolean);
        const hits = raycaster.intersectObjects(hitboxes, false);
        if (!hits.length) return null;
        const hitObj = hits[0].object;
        return entities.find((p) => p.root.userData.pigHitbox === hitObj) || null;
      }

      function hurt(pig, amount = 4, source = 'player', sourcePos = null, extraKnockback = 0) {
        if (!pig) return;
        applyHitFeedback(pig, sourcePos, amount, extraKnockback);
        pig.hp -= amount;
        if (pig.hp > 0) {
          pig.changeDirMs = 0;
          pig.panicUntilMs = performance.now() + 3800;
          pig.dir.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2).normalize();
          return;
        }
        const idx = entities.indexOf(pig);
        if (idx >= 0) entities.splice(idx, 1);
        getScene?.()?.remove(pig.root);
        if (source === 'player') showGameMessage?.('Pig defeated.');
      }

      return {
        getEntities: () => entities,
        loadTexture,
        spawnAt,
        spawnAtExact,
        spawnInitial,
        update,
        getHitFromCrosshair,
        hurt,
      };
    },
  };
})();
