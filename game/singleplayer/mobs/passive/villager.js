(function () {
  const root = (window.SingleplayerMobData = window.SingleplayerMobData || {
    categories: { passive: {}, neutral: {}, hostile: {} },
  });

  root.categories.passive.villager = {
    id: 5,
    key: 'villager',
    name: 'Villager',
    category: 'passive',
    behavior: {
      goals: [
        { priority: 0, key: 'float', label: 'FloatGoal', description: 'Keeps villager above liquids' },
        { priority: 1, key: 'panic', label: 'PanicGoal', description: 'Runs randomly after taking damage or while threatened' },
        { priority: 2, key: 'avoidHostile', label: 'AvoidHostileMobGoal', description: 'Avoids nearby hostile mobs like zombies' },
        { priority: 5, key: 'moveThroughVillage', label: 'MoveThroughVillageGoal', description: 'Paths between village areas and connectors' },
        { priority: 6, key: 'moveToTargetPosition', label: 'MoveToTargetPositionGoal', description: 'General navigation to a selected target position' },
        { priority: 7, key: 'walkToVillageCenter', label: 'WalkToVillageCenterGoal', description: 'Walks toward village well/center when too far away' },
        { priority: 8, key: 'walkToPoi', label: 'WalkToPOIGoal', description: 'Navigates to village POI targets such as beds, bells, and well' },
        { priority: 9, key: 'moveIndoors', label: 'MoveIndoorsGoal', description: 'Moves indoors during rain or danger' },
        { priority: 10, key: 'moveToHome', label: 'MoveToHomeGoal', description: 'Returns toward assigned bed/home location' },
        { priority: 11, key: 'villageInteractionStroll', label: 'VillageInteractionStrollGoal', description: 'Wanders near the village meeting point/well' },
        { priority: 12, key: 'tradeWithPlayer', label: 'TradeWithPlayerGoal', description: 'Opens trade interface with player (future behavior)' },
        { priority: 13, key: 'lookAtTradingPlayer', label: 'LookAtTradingPlayerGoal', description: 'Focuses on the current trading player (future behavior)' },
        { priority: 14, key: 'lookAtPlayer', label: 'LookAtPlayerGoal', description: 'Looks at nearby players' },
        { priority: 15, key: 'randomStroll', label: 'RandomStrollGoal', description: 'Normal random wandering around village area' },
        { priority: 16, key: 'randomStrollFar', label: 'RandomStrollFarGoal', description: 'Longer-distance random wandering path' },
        { priority: 17, key: 'lookAtEntity', label: 'LookAtEntityGoal', description: 'Glances at nearby entities/mobs' },
        { priority: 18, key: 'lookAround', label: 'LookAroundGoal', description: 'Idle head movement while standing' },
      ],
      poiCategories: ['well', 'bed', 'bell'],
      indoorShelter: { type: 'home' },
    },
  };

  window.SingleplayerVillagerMob = {
    create({
      THREE,
      getScene,
      getYawObject,
      getRaycaster,
      prepareCrosshairRaycast,
      getSurfaceYForEntity,
      getBlockType,
      isLiquid,
      isEntityActiveAt,
      applyMobCommandHeight,
      applyHitFeedback,
      tickMobHitFeedback,
      showGameMessage,
      getZombieEntities,
      createStevePartMesh,
      getSkinPartRects,
    }) {
      const entities = [];
      const villagerMobDef = window.SingleplayerMobData?.categories?.passive?.villager || null;
      const villagerGoalPriority = Array.isArray(villagerMobDef?.behavior?.goals)
        ? [...villagerMobDef.behavior.goals].sort((a, b) => a.priority - b.priority)
        : [];

      function createMesh() {
        const villager = new THREE.Group();
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

        villager.add(body, head, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot);
        const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.78, 0.62), new THREE.MeshBasicMaterial({ visible: false }));
        hitbox.position.y = 0.9;
        villager.add(hitbox);
        villager.userData.villagerParts = { head, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot };
        villager.userData.villagerHitbox = hitbox;
        return villager;
      }

      function spawnAtExact(wx, y, wz, homeCenter = null, villageCenter = null, poiTargets = null, heightBlocks = null) {
        const root = createMesh();
        applyMobCommandHeight(root, heightBlocks, 1.8);
        root.position.set(Math.floor(wx) + 0.5, y, Math.floor(wz) + 0.5);
        getScene?.()?.add(root);
        entities.push({
          root,
          hp: 20,
          dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
          changeDirMs: 800 + Math.random() * 1200,
          bobPhase: Math.random() * Math.PI * 2,
          targetY: y,
          groundProbeMs: 0,
          homeCenter,
          villageCenter,
          poiTargets,
          roamRadius: 7 + Math.random() * 3,
          panicUntilMs: 0,
          nextPanicTurnMs: 0,
          panicDir: null,
          currentMoveTarget: null,
          currentPoiIndex: 0,
          nextVillagePathSwitchMs: 0,
          villagePathPhase: 0,
          nextMeetingStrollMs: 0,
          meetingStrollTarget: null,
          nextStrollPickMs: 0,
          randomStrollTarget: null,
          nextLookChangeMs: 0,
          lookYaw: 0,
          lookPitch: 0,
          lookTargetYaw: 0,
          lookTargetPitch: 0,
        });
        return true;
      }

      function spawnForCommand(wx, wz, heightBlocks = null) {
        const y = getSurfaceYForEntity(wx, wz, 72);
        if (y <= 0) return false;
        const center = { x: Math.floor(wx) + 0.5, z: Math.floor(wz) + 0.5 };
        return spawnAtExact(wx, y, wz, center, center, [{ key: 'well', x: center.x, z: center.z }], heightBlocks);
      }

      function getHitFromCrosshair() {
        if (!entities.length) return null;
        if (!prepareCrosshairRaycast()) return null;
        const raycaster = getRaycaster?.();
        if (!raycaster) return null;
        const hitboxes = entities.map((v) => v.root.userData.villagerHitbox).filter(Boolean);
        const hits = raycaster.intersectObjects(hitboxes, false);
        if (!hits.length) return null;
        const hitObj = hits[0].object;
        return entities.find((v) => v.root.userData.villagerHitbox === hitObj) || null;
      }

      function hurt(villager, amount = 4, source = 'player', sourcePos = null, extraKnockback = 0) {
        if (!villager) return;
        applyHitFeedback(villager, sourcePos, amount, extraKnockback);
        villager.hp -= amount;
        villager.changeDirMs = 0;
        villager.panicUntilMs = performance.now() + 3600;
        if (source === 'player') showGameMessage?.('Villager: hrmm...');
        if (villager.hp > 0) return;
        const idx = entities.indexOf(villager);
        if (idx >= 0) entities.splice(idx, 1);
        getScene?.()?.remove(villager.root);
      }

      function findClosestZombieThreat(position, maxDistance = 10) {
        const zombieEntities = getZombieEntities?.() || [];
        if (!zombieEntities.length) return null;
        let best = null;
        let bestDist = maxDistance;
        for (const z of zombieEntities) {
          if (!isEntityActiveAt(z.root.position)) continue;
          const d = z.root.position.distanceTo(position);
          if (d < bestDist) {
            bestDist = d;
            best = z;
          }
        }
        return best;
      }

      function getPoiTargets(villager) {
        if (Array.isArray(villager?.poiTargets) && villager.poiTargets.length) return villager.poiTargets;
        if (villager?.villageCenter) return [{ key: 'well', x: villager.villageCenter.x, z: villager.villageCenter.z }];
        if (villager?.homeCenter) return [{ key: 'home', x: villager.homeCenter.x, z: villager.homeCenter.z }];
        return [];
      }

      function applyTargetSteer(desiredDir, villager, target, weight = 1) {
        if (!target) return;
        const tx = Number(target.x);
        const tz = Number(target.z);
        if (!Number.isFinite(tx) || !Number.isFinite(tz)) return;
        const toTarget = new THREE.Vector3(tx - villager.root.position.x, 0, tz - villager.root.position.z);
        if (toTarget.lengthSq() > 0.0001) desiredDir.add(toTarget.normalize().multiplyScalar(weight));
      }

      function ensureVillagePathTarget(villager, nowMs) {
        if ((villager.nextVillagePathSwitchMs || 0) > nowMs && villager.currentMoveTarget?.source === 'villagePath') return;
        villager.nextVillagePathSwitchMs = nowMs + 1600 + Math.random() * 2200;
        const home = villager.homeCenter;
        const center = villager.villageCenter || home;
        villager.villagePathPhase = ((villager.villagePathPhase || 0) + 1) % 3;
        if (villager.villagePathPhase === 0 && home) {
          villager.currentMoveTarget = { x: home.x, z: home.z, source: 'villagePath-home' };
          return;
        }
        if (villager.villagePathPhase === 1 && center) {
          villager.currentMoveTarget = { x: center.x, z: center.z, source: 'villagePath-center' };
          return;
        }
        if (home && center) {
          const midX = (home.x + center.x) * 0.5;
          const midZ = (home.z + center.z) * 0.5;
          const offX = (Math.random() - 0.5) * 3;
          const offZ = (Math.random() - 0.5) * 3;
          villager.currentMoveTarget = { x: midX + offX, z: midZ + offZ, source: 'villagePath-mid' };
        } else if (center) {
          villager.currentMoveTarget = { x: center.x + (Math.random() - 0.5) * 6, z: center.z + (Math.random() - 0.5) * 6, source: 'villagePath-center-roam' };
        }
      }

      function update(time, deltaMs) {
        if (!entities.length) return;
        const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
        const nowMs = performance.now();
        const yawObject = getYawObject?.();
        if (!yawObject) return;

        for (const villager of entities) {
          if (!isEntityActiveAt(villager.root.position)) continue;
          tickMobHitFeedback(villager, deltaMs);
          villager.changeDirMs -= deltaMs;
          const home = villager.homeCenter;
          const center = villager.villageCenter || home;
          const homeDx = home ? (home.x - villager.root.position.x) : 0;
          const homeDz = home ? (home.z - villager.root.position.z) : 0;
          const homeDist = home ? Math.hypot(homeDx, homeDz) : 0;
          const centerDx = center ? (center.x - villager.root.position.x) : 0;
          const centerDz = center ? (center.z - villager.root.position.z) : 0;
          const centerDist = center ? Math.hypot(centerDx, centerDz) : 0;
          const inLiquid = isLiquid(getBlockType(Math.floor(villager.root.position.x), Math.floor(villager.root.position.y), Math.floor(villager.root.position.z)));
          const threat = findClosestZombieThreat(villager.root.position, 10);
          const threatPos = threat?.root?.position || null;
          const threatDist = threatPos ? Math.hypot(villager.root.position.x - threatPos.x, villager.root.position.z - threatPos.z) : Number.POSITIVE_INFINITY;
          const panicActive = (villager.panicUntilMs || 0) > nowMs;

          if (villager.changeDirMs <= 0) {
            villager.changeDirMs = 700 + Math.random() * 1300;
            if (panicActive) villager.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            else if (home && homeDist > villager.roamRadius + 0.75) villager.dir.set(homeDx, 0, homeDz).normalize();
            else villager.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          }

          const desiredDir = villager.dir.clone();
          const poiTargets = getPoiTargets(villager);
          let speed = 0.58;
          let movementChosen = false;
          let lookChosen = false;

          for (const goal of villagerGoalPriority) {
            if (goal.key === 'float' && inLiquid) {
              villager.targetY = Math.max(villager.targetY, villager.root.position.y + 0.1);
              speed = Math.max(speed, 0.72);
              movementChosen = true;
              continue;
            }
            if (goal.key === 'panic' && (panicActive || threatDist < 5.5)) {
              villager.nextPanicTurnMs = (villager.nextPanicTurnMs || 0) - deltaMs;
              if (villager.nextPanicTurnMs <= 0 || !villager.panicDir || villager.panicDir.lengthSq() < 0.0001) {
                villager.nextPanicTurnMs = 260 + Math.random() * 360;
                villager.panicDir = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
                if (villager.panicDir.lengthSq() > 0.0001) villager.panicDir.normalize();
              }
              if (villager.panicDir && villager.panicDir.lengthSq() > 0.0001) desiredDir.add(villager.panicDir.clone().multiplyScalar(1.15));
              if (threatPos) {
                const away = new THREE.Vector3(villager.root.position.x - threatPos.x, 0, villager.root.position.z - threatPos.z);
                if (away.lengthSq() > 0.0001) desiredDir.add(away.normalize().multiplyScalar(1.8));
                villager.panicUntilMs = Math.max(villager.panicUntilMs || 0, nowMs + 900);
              }
              speed = Math.max(speed, 0.92);
              movementChosen = true;
              continue;
            }
            if (!movementChosen && goal.key === 'moveIndoors' && home && threatDist < 6.5) {
              villager.currentMoveTarget = { x: home.x, z: home.z, source: 'indoors' };
              applyTargetSteer(desiredDir, villager, home, 1.2);
              speed = Math.max(speed, 0.82);
              movementChosen = true;
              continue;
            }
            if (!movementChosen && goal.key === 'walkToVillageCenter' && center && centerDist > villager.roamRadius + 2) {
              applyTargetSteer(desiredDir, villager, center, 1.06);
              villager.currentMoveTarget = { x: center.x, z: center.z, source: 'center' };
              speed = Math.max(speed, 0.74);
              movementChosen = true;
              continue;
            }
            if (!movementChosen && (goal.key === 'wanderHome' || goal.key === 'moveToHome') && home && homeDist > villager.roamRadius + 0.4) {
              villager.currentMoveTarget = { x: home.x, z: home.z, source: 'home' };
              applyTargetSteer(desiredDir, villager, home, 1.0);
              speed = Math.max(speed, 0.7);
              movementChosen = true;
              continue;
            }
            if (!movementChosen && goal.key === 'walkToPoi' && poiTargets.length) {
              if (!Number.isFinite(villager.currentPoiIndex) || villager.currentPoiIndex < 0) villager.currentPoiIndex = Math.floor(Math.random() * poiTargets.length);
              const poi = poiTargets[(villager.currentPoiIndex % poiTargets.length + poiTargets.length) % poiTargets.length];
              const poiDist = poi ? Math.hypot(villager.root.position.x - poi.x, villager.root.position.z - poi.z) : Number.POSITIVE_INFINITY;
              if (poiDist < 1.5) villager.currentPoiIndex = (villager.currentPoiIndex + 1) % poiTargets.length;
              const nextPoi = poiTargets[(villager.currentPoiIndex % poiTargets.length + poiTargets.length) % poiTargets.length];
              if (nextPoi) {
                applyTargetSteer(desiredDir, villager, nextPoi, 0.72);
                speed = Math.max(speed, 0.66);
                movementChosen = true;
              }
              continue;
            }
            if (!movementChosen && goal.key === 'moveThroughVillage') {
              ensureVillagePathTarget(villager, nowMs);
              if (villager.currentMoveTarget?.source?.startsWith('villagePath')) {
                applyTargetSteer(desiredDir, villager, villager.currentMoveTarget, 0.84);
                speed = Math.max(speed, 0.68);
                movementChosen = true;
              }
              continue;
            }
            if (!movementChosen && goal.key === 'moveToTargetPosition' && villager.currentMoveTarget) {
              const targetDist = Math.hypot(villager.root.position.x - villager.currentMoveTarget.x, villager.root.position.z - villager.currentMoveTarget.z);
              if (targetDist < 1.25) villager.currentMoveTarget = null;
              else {
                applyTargetSteer(desiredDir, villager, villager.currentMoveTarget, 0.92);
                speed = Math.max(speed, 0.7);
                movementChosen = true;
              }
              continue;
            }
            if (!movementChosen && goal.key === 'villageInteractionStroll' && center) {
              villager.nextMeetingStrollMs = (villager.nextMeetingStrollMs || 0) - deltaMs;
              if (villager.nextMeetingStrollMs <= 0 || !villager.meetingStrollTarget) {
                villager.nextMeetingStrollMs = 1600 + Math.random() * 2200;
                villager.meetingStrollTarget = { x: center.x + (Math.random() - 0.5) * 4, z: center.z + (Math.random() - 0.5) * 4 };
              }
              applyTargetSteer(desiredDir, villager, villager.meetingStrollTarget, 0.4);
              speed = Math.max(speed, 0.58);
              movementChosen = true;
              continue;
            }
            if (!movementChosen && (goal.key === 'randomStroll' || goal.key === 'randomStrollFar')) {
              const far = goal.key === 'randomStrollFar';
              villager.nextStrollPickMs = (villager.nextStrollPickMs || 0) - deltaMs;
              if (villager.nextStrollPickMs <= 0 || !villager.randomStrollTarget || villager.randomStrollTarget.far !== far) {
                villager.nextStrollPickMs = (far ? 2600 : 1400) + Math.random() * (far ? 2800 : 1700);
                const origin = center || home || { x: villager.root.position.x, z: villager.root.position.z };
                const radius = far ? 9 : 4.5;
                villager.randomStrollTarget = { x: origin.x + (Math.random() - 0.5) * radius, z: origin.z + (Math.random() - 0.5) * radius, far };
              }
              applyTargetSteer(desiredDir, villager, villager.randomStrollTarget, far ? 0.3 : 0.44);
              speed = Math.max(speed, far ? 0.62 : 0.6);
              movementChosen = true;
              continue;
            }
            if (!lookChosen && goal.key === 'lookAtPlayer') {
              const toPlayer = new THREE.Vector3(yawObject.position.x - villager.root.position.x, 0, yawObject.position.z - villager.root.position.z);
              if (toPlayer.length() < 6.5) {
                const yaw = Math.atan2(toPlayer.x, toPlayer.z) - villager.root.rotation.y;
                villager.lookTargetYaw = THREE.MathUtils.clamp(yaw, -0.85, 0.85);
                villager.lookTargetPitch = 0;
                lookChosen = true;
              }
              continue;
            }
            if (!lookChosen && goal.key === 'lookAtEntity' && threatPos && threatDist < 6.8) {
              const toThreat = new THREE.Vector3(threatPos.x - villager.root.position.x, 0, threatPos.z - villager.root.position.z);
              const yaw = Math.atan2(toThreat.x, toThreat.z) - villager.root.rotation.y;
              villager.lookTargetYaw = THREE.MathUtils.clamp(yaw, -0.9, 0.9);
              lookChosen = true;
              continue;
            }
            if (!lookChosen && (goal.key === 'observe' || goal.key === 'lookAround')) {
              villager.nextLookChangeMs -= deltaMs;
              if (villager.nextLookChangeMs <= 0) {
                villager.nextLookChangeMs = 900 + Math.random() * 1700;
                villager.lookTargetYaw = (Math.random() - 0.5) * 0.75;
                villager.lookTargetPitch = (Math.random() - 0.5) * 0.28;
              }
              lookChosen = true;
            }
          }

          if (desiredDir.lengthSq() > 0.00001) {
            const nextDir = desiredDir.normalize();
            villager.dir.lerp(nextDir, Math.min(1, dt * 4.2));
            if (villager.dir.lengthSq() > 0.00001) villager.dir.normalize();
          }

          const nx = villager.root.position.x + villager.dir.x * speed * dt;
          const nz = villager.root.position.z + villager.dir.z * speed * dt;
          villager.groundProbeMs -= deltaMs;
          if (villager.groundProbeMs <= 0) {
            villager.groundProbeMs = 180 + Math.random() * 120;
            villager.targetY = getSurfaceYForEntity(nx, nz, villager.targetY);
          }
          if (villager.targetY > 0) {
            villager.root.position.x = nx;
            villager.root.position.z = nz;
            villager.root.position.y += (villager.targetY - villager.root.position.y) * Math.min(1, dt * 10);
          }

          villager.root.rotation.y = Math.atan2(villager.dir.x, villager.dir.z);
          villager.lookYaw += (villager.lookTargetYaw - villager.lookYaw) * Math.min(1, dt * 6);
          villager.lookPitch += (villager.lookTargetPitch - villager.lookPitch) * Math.min(1, dt * 6);
          const parts = villager.root.userData.villagerParts || {};
          if (parts.head) {
            parts.head.rotation.y = villager.lookYaw;
            parts.head.rotation.x = villager.lookPitch;
          }
          const walk = Math.sin(time * 0.012 + villager.bobPhase) * 0.32;
          if (parts.leftLegPivot) parts.leftLegPivot.rotation.x = walk;
          if (parts.rightLegPivot) parts.rightLegPivot.rotation.x = -walk;
          if (parts.leftArmPivot) parts.leftArmPivot.rotation.x = -walk * 0.85;
          if (parts.rightArmPivot) parts.rightArmPivot.rotation.x = walk * 0.85;
        }
      }

      return {
        getEntities: () => entities,
        spawnAtExact,
        spawnForCommand,
        getHitFromCrosshair,
        hurt,
        update,
      };
    },
  };
})();
