(function () {
  const root = (window.SingleplayerMobData = window.SingleplayerMobData || {
    categories: { passive: {}, neutral: {}, hostile: {} },
  });

  root.categories.neutral.wolf = {
    id: 3,
    key: 'wolf',
    name: 'Wolf',
    category: 'neutral',
  };

  window.SingleplayerWolfMob = {
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
      showGameMessage,
      getPigEntities,
      getZombieEntities,
      hurtPig,
      hurtZombie,
      canSpawnMob,
      despawnDistance = 70,
    }) {
      const entities = [];

      function createMesh() {
        const U = 1 / 16;
        const wolf = new THREE.Group();
        const furMat = new THREE.MeshStandardMaterial({ color: 0x9ea4ad, roughness: 0.9 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x676d75, roughness: 0.92 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(10 * U, 6 * U, 16 * U), furMat);
        body.position.y = 9 * U;
        wolf.add(body);

        const neck = new THREE.Mesh(new THREE.BoxGeometry(6 * U, 6 * U, 6 * U), darkMat);
        neck.position.set(0, 10 * U, 7 * U);
        wolf.add(neck);

        const head = new THREE.Mesh(new THREE.BoxGeometry(6 * U, 6 * U, 6 * U), furMat);
        head.position.set(0, 11 * U, 11 * U);
        wolf.add(head);

        const legOffsets = [[-3 * U, 3 * U, 5 * U], [3 * U, 3 * U, 5 * U], [-3 * U, 3 * U, -5 * U], [3 * U, 3 * U, -5 * U]];
        const legs = [];
        for (const off of legOffsets) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(3 * U, 6 * U, 3 * U), darkMat);
          leg.position.set(off[0], off[1], off[2]);
          wolf.add(leg);
          legs.push(leg);
        }

        const tailPivot = new THREE.Group();
        tailPivot.position.set(0, 9 * U, -8 * U);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(2 * U, 6 * U, 2 * U), darkMat);
        tail.position.set(0, 2.5 * U, -0.5 * U);
        tailPivot.add(tail);
        wolf.add(tailPivot);

        const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.95, 1.05), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hitbox.position.set(0, 0.5, 0);
        hitbox.userData.wolfHitbox = true;
        wolf.add(hitbox);
        wolf.userData.wolfHitbox = hitbox;
        wolf.userData.wolfParts = { head, legs, tailPivot, neck };
        return wolf;
      }

      function spawnAt(wx, wz, heightBlocks = null) {
        if (canSpawnMob && !canSpawnMob()) return false;
        const y = getSurfaceYForEntity(wx, wz);
        if (y <= 0) return false;
        return spawnAtExact(wx, y, wz, heightBlocks);
      }

      function spawnAtExact(wx, y, wz, heightBlocks = null) {
        const root = createMesh();
        applyMobCommandHeight(root, heightBlocks, 0.95);
        root.position.set(Math.floor(wx) + 0.5, y, Math.floor(wz) + 0.5);
        getScene?.()?.add(root);
        entities.push({
          root,
          hp: 12,
          dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
          changeDirMs: 900 + Math.random() * 1400,
          bobPhase: Math.random() * Math.PI * 2,
          targetY: y,
          groundProbeMs: 0,
          attackCooldownMs: 0,
          retargetMs: 0,
          combatTarget: null,
          combatTargetType: null,
          tamed: false,
        });
        return true;
      }

      function spawnInitial() {
        let spawned = 0;
        for (let i = 0; i < 180 && spawned < 8; i++) {
          const yawObject = getYawObject?.();
          if (!yawObject) break;
          const wx = yawObject.position.x + (Math.random() - 0.5) * 52;
          const wz = yawObject.position.z + (Math.random() - 0.5) * 52;
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
        const hitboxes = entities.map((w) => w.root.userData.wolfHitbox).filter(Boolean);
        const hits = raycaster.intersectObjects(hitboxes, false);
        if (!hits.length) return null;
        const hitObj = hits[0].object;
        return entities.find((w) => w.root.userData.wolfHitbox === hitObj) || null;
      }

      function hurt(wolf, amount = 4, sourcePos = null, extraKnockback = 0) {
        if (!wolf) return;
        applyHitFeedback(wolf, sourcePos, amount, extraKnockback);
        wolf.hp -= amount;
        if (wolf.hp > 0) {
          wolf.changeDirMs = 0;
          wolf.dir.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2).normalize();
          showGameMessage?.(wolf.tamed ? 'Dog: whine!' : 'Wolf: growl!');
          return;
        }
        const idx = entities.indexOf(wolf);
        if (idx >= 0) entities.splice(idx, 1);
        getScene?.()?.remove(wolf.root);
        showGameMessage?.(wolf.tamed ? 'Your dog died.' : 'Wolf defeated.');
      }

      function commandTamedAttack(target, targetType) {
        if (!target) return;
        for (const wolf of entities) {
          if (!isEntityActiveAt(wolf.root.position)) continue;
          if (!wolf.tamed) continue;
          wolf.combatTarget = target;
          wolf.combatTargetType = targetType;
          wolf.changeDirMs = 0;
        }
      }

      function tame(wolf) {
        if (!wolf || wolf.tamed) return false;
        wolf.tamed = true;
        const neck = wolf.root.userData?.wolfParts?.neck;
        if (neck?.material) neck.material.color.setHex(0xc64444);
        return true;
      }

      function update(time, deltaMs) {
        if (!entities.length) return;
        const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
        const yawObject = getYawObject?.();
        if (!yawObject) return;
        const playerPos = yawObject.position;
        const pigEntities = getPigEntities?.() || [];
        const zombieEntities = getZombieEntities?.() || [];

        for (let i = entities.length - 1; i >= 0; i--) {
          const wolf = entities[i];
          const distToPlayer = wolf.root.position.distanceTo(playerPos);
          if (distToPlayer > despawnDistance) {
            entities.splice(i, 1);
            getScene?.()?.remove(wolf.root);
            continue;
          }
          wolf.attackCooldownMs = Math.max(0, wolf.attackCooldownMs - deltaMs);
          wolf.changeDirMs -= deltaMs;
          wolf.retargetMs -= deltaMs;

          let targetPos = null;
          let targetDist = Infinity;

          if (wolf.combatTargetType === 'pig' && (!wolf.combatTarget || pigEntities.indexOf(wolf.combatTarget) < 0)) {
            wolf.combatTarget = null;
            wolf.combatTargetType = null;
          }
          if (wolf.combatTargetType === 'zombie' && (!wolf.combatTarget || zombieEntities.indexOf(wolf.combatTarget) < 0)) {
            wolf.combatTarget = null;
            wolf.combatTargetType = null;
          }

          if (!wolf.combatTarget && !wolf.tamed && wolf.retargetMs <= 0) {
            wolf.retargetMs = 500 + Math.random() * 420;
            let bestPig = null;
            let bestDist = 11;
            for (const pig of pigEntities) {
              if (!isEntityActiveAt(pig.root.position)) continue;
              const d = pig.root.position.distanceTo(wolf.root.position);
              if (d < bestDist) {
                bestDist = d;
                bestPig = pig;
              }
            }
            if (bestPig) {
              wolf.combatTarget = bestPig;
              wolf.combatTargetType = 'pig';
            }
          }

          if (wolf.combatTarget) {
            targetPos = wolf.combatTarget.root.position;
            targetDist = targetPos.distanceTo(wolf.root.position);
            const toTarget = new THREE.Vector3(targetPos.x - wolf.root.position.x, 0, targetPos.z - wolf.root.position.z);
            if (toTarget.lengthSq() > 0.00001) {
              toTarget.normalize();
              wolf.dir.copy(toTarget);
            }
          } else if (wolf.tamed) {
            const toPlayer = new THREE.Vector3(playerPos.x - wolf.root.position.x, 0, playerPos.z - wolf.root.position.z);
            targetDist = toPlayer.length();
            if (targetDist > 3.25) {
              toPlayer.normalize();
              wolf.dir.copy(toPlayer);
            } else if (wolf.changeDirMs <= 0) {
              wolf.changeDirMs = 1200 + Math.random() * 800;
              wolf.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            }
          } else if (wolf.changeDirMs <= 0) {
            wolf.changeDirMs = 1000 + Math.random() * 1800;
            wolf.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          }

          const speed = wolf.combatTarget ? 1.15 : (wolf.tamed ? 1.0 : 0.82);
          const nx = wolf.root.position.x + wolf.dir.x * speed * dt;
          const nz = wolf.root.position.z + wolf.dir.z * speed * dt;

          wolf.groundProbeMs -= deltaMs;
          if (wolf.groundProbeMs <= 0) {
            wolf.groundProbeMs = 180 + Math.random() * 120;
            wolf.targetY = getSurfaceYForEntity(nx, nz, wolf.targetY);
          }
          if (wolf.targetY > 0) {
            wolf.root.position.x = nx;
            wolf.root.position.z = nz;
            wolf.root.position.y += (wolf.targetY - wolf.root.position.y) * Math.min(1, dt * 11);
          }
          wolf.root.rotation.y = Math.atan2(wolf.dir.x, wolf.dir.z);

          if (wolf.combatTarget && targetDist < 1.35 && wolf.attackCooldownMs <= 0) {
            wolf.attackCooldownMs = 650;
            if (wolf.combatTargetType === 'pig') hurtPig?.(wolf.combatTarget, 4, 'wolf', wolf.root.position);
            else if (wolf.combatTargetType === 'zombie') hurtZombie?.(wolf.combatTarget, 3, wolf.root.position);
          }

          const parts = wolf.root.userData.wolfParts || {};
          const walk = Math.sin(time * 0.011 + wolf.bobPhase) * (wolf.combatTarget ? 0.4 : 0.24);
          const legs = parts.legs || [];
          if (legs[0]) legs[0].rotation.x = walk;
          if (legs[1]) legs[1].rotation.x = -walk;
          if (legs[2]) legs[2].rotation.x = -walk;
          if (legs[3]) legs[3].rotation.x = walk;
          if (parts.tailPivot) {
            const wag = wolf.tamed ? Math.sin(time * 0.03 + wolf.bobPhase) * 0.5 : 0.12;
            parts.tailPivot.rotation.x = -0.55 + wag;
          }
        }
      }

      return {
        getEntities: () => entities,
        spawnAt,
        spawnAtExact,
        spawnInitial,
        spawnForCommand,
        getHitFromCrosshair,
        hurt,
        tame,
        commandTamedAttack,
        update,
      };
    },
  };
})();
