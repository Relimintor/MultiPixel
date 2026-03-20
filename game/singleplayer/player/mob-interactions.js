(function () {
    function applyDamageFlashToRoot(root, active) {
        if (!root) return;
        root.traverse((obj) => {
            if (!obj?.isMesh || !obj.material) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const mat of mats) {
                if (!mat) continue;
                if (typeof mat.emissive !== 'undefined') {
                    if (mat.userData.baseEmissiveHex == null) mat.userData.baseEmissiveHex = mat.emissive.getHex();
                    mat.emissive.setHex(active ? 0x7a0000 : mat.userData.baseEmissiveHex);
                    if (typeof mat.emissiveIntensity === 'number') mat.emissiveIntensity = active ? 1.15 : 1.0;
                } else if (mat.color) {
                    if (mat.userData.baseColorHex == null) mat.userData.baseColorHex = mat.color.getHex();
                    mat.color.setHex(active ? 0xff4a4a : mat.userData.baseColorHex);
                }
            }
        });
    }

    function applyHitFeedback({ entity, sourcePos = null, amount = 4, extraKnockback = 0, yawObject, THREE }) {
        if (!entity?.root) return;
        const baseStrength = Math.max(0.12, Math.min(0.42, 0.07 + amount * 0.018));
        const enchantScale = Math.max(0, Number(extraKnockback) || 0);
        const strength = Math.min(6.0, baseStrength + enchantScale * 0.015);
        const src = sourcePos || yawObject?.position || null;
        if (src) {
            const away = new THREE.Vector3(entity.root.position.x - src.x, 0, entity.root.position.z - src.z);
            if (away.lengthSq() < 0.0001) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
            away.normalize().multiplyScalar(strength);
            entity.knockbackVX = (entity.knockbackVX || 0) + away.x;
            entity.knockbackVZ = (entity.knockbackVZ || 0) + away.z;
            const lift = Math.min(2.6, 0.08 + enchantScale * 0.006);
            entity.knockbackVY = Math.max(entity.knockbackVY || 0, lift);
        }
        entity.hitFlashMs = Math.max(entity.hitFlashMs || 0, 120);
        applyDamageFlashToRoot(entity.root, true);
    }

    function tickMobHitFeedback(entity, deltaMs) {
        if (!entity?.root) return;
        const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
        entity.hitFlashMs = Math.max(0, (entity.hitFlashMs || 0) - deltaMs);
        applyDamageFlashToRoot(entity.root, entity.hitFlashMs > 0);

        const kvx = entity.knockbackVX || 0;
        const kvz = entity.knockbackVZ || 0;
        let kvy = entity.knockbackVY || 0;
        if (Math.abs(kvx) + Math.abs(kvz) + Math.abs(kvy) > 0.0002) {
            entity.root.position.x += kvx;
            entity.root.position.z += kvz;
            entity.root.position.y += kvy;
            kvy -= dt * 0.42;
            entity.knockbackVX = kvx * Math.max(0, 1 - dt * 12);
            entity.knockbackVZ = kvz * Math.max(0, 1 - dt * 12);
            entity.knockbackVY = kvy * Math.max(0, 1 - dt * 3);
        } else {
            entity.knockbackVX = 0;
            entity.knockbackVZ = 0;
            entity.knockbackVY = 0;
        }
    }

    function resolveCircleOverlap(ax, az, ar, bx, bz, br) {
        const dx = bx - ax;
        const dz = bz - az;
        const distSq = dx * dx + dz * dz;
        const minDist = ar + br;
        if (distSq >= minDist * minDist) return null;
        const dist = Math.sqrt(Math.max(0.000001, distSq));
        const nx = dx / dist;
        const nz = dz / dist;
        const push = minDist - dist;
        return { nx, nz, push };
    }

    function resolveMobEntityPushing({ yawObject, PLAYER_RADIUS, pigEntities, wolfEntities, pandaEntities, zombieEntities, villagerEntities, gnomeEntities, mobCollisionRadius }) {
        const colliders = [];
        for (const pig of pigEntities) colliders.push({ kind: 'pig', ref: pig, pos: pig.root.position, radius: mobCollisionRadius.pig });
        for (const wolf of wolfEntities) colliders.push({ kind: 'wolf', ref: wolf, pos: wolf.root.position, radius: mobCollisionRadius.wolf });
        for (const panda of pandaEntities) colliders.push({ kind: 'panda', ref: panda, pos: panda.root.position, radius: mobCollisionRadius.panda });
        for (const zombie of zombieEntities) colliders.push({ kind: 'zombie', ref: zombie, pos: zombie.root.position, radius: mobCollisionRadius.zombie });
        for (const villager of villagerEntities) colliders.push({ kind: 'villager', ref: villager, pos: villager.root.position, radius: mobCollisionRadius.villager });
        for (const gnome of gnomeEntities) colliders.push({ kind: 'gnome', ref: gnome, pos: gnome.root.position, radius: mobCollisionRadius.gnome });

        for (const c of colliders) {
            const overlap = resolveCircleOverlap(yawObject.position.x, yawObject.position.z, PLAYER_RADIUS, c.pos.x, c.pos.z, c.radius);
            if (!overlap) continue;
            const pushHalf = overlap.push * 0.5 + 0.001;
            yawObject.position.x -= overlap.nx * pushHalf;
            yawObject.position.z -= overlap.nz * pushHalf;
            c.pos.x += overlap.nx * pushHalf;
            c.pos.z += overlap.nz * pushHalf;
        }

        for (let i = 0; i < colliders.length; i++) {
            for (let j = i + 1; j < colliders.length; j++) {
                const a = colliders[i];
                const b = colliders[j];
                const overlap = resolveCircleOverlap(a.pos.x, a.pos.z, a.radius, b.pos.x, b.pos.z, b.radius);
                if (!overlap) continue;
                const pushHalf = overlap.push * 0.5 + 0.001;
                a.pos.x -= overlap.nx * pushHalf;
                a.pos.z -= overlap.nz * pushHalf;
                b.pos.x += overlap.nx * pushHalf;
                b.pos.z += overlap.nz * pushHalf;
            }
        }
    }

    window.SingleplayerPlayerMobInteractions = {
        applyDamageFlashToRoot,
        applyHitFeedback,
        tickMobHitFeedback,
        resolveCircleOverlap,
        resolveMobEntityPushing,
    };
})();
