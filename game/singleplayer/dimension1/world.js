(function () {
  function create({
    portalBlockZId,
    portalBlockXId,
    glowstoneId = 119,
    dirtId = 1,
    teleportToCoordinates,
    setBlock,
    showGameMessage,
  }) {
    const OVERWORLD_ANCHOR = { x: 0, y: 88, z: 0 };
    const DIMENSION1_ANCHOR = { x: 4096, y: 88, z: 4096 };
    let currentDimension = 'overworld';

    function setSafe(wx, wy, wz, id) {
      return Boolean(setBlock?.(wx, wy, wz, id));
    }

    function buildPortalPlatform(center) {
      const baseY = Math.floor(center.y);
      for (let x = center.x - 4; x <= center.x + 4; x++) {
        for (let z = center.z - 4; z <= center.z + 4; z++) {
          setSafe(x, baseY, z, dirtId);
          setSafe(x, baseY + 1, z, 0);
          setSafe(x, baseY + 2, z, 0);
          setSafe(x, baseY + 3, z, 0);
        }
      }
    }

    function buildLinkedPortal(center) {
      const bx = Math.floor(center.x);
      const by = Math.floor(center.y + 1);
      const bz = Math.floor(center.z);

      for (let y = 0; y <= 4; y++) {
        setSafe(bx - 1, by + y, bz, glowstoneId);
        setSafe(bx + 2, by + y, bz, glowstoneId);
      }
      for (let x = -1; x <= 2; x++) {
        setSafe(bx + x, by, bz, glowstoneId);
        setSafe(bx + x, by + 4, bz, glowstoneId);
      }

      for (let y = 1; y <= 3; y++) {
        setSafe(bx, by + y, bz, portalBlockZId);
        setSafe(bx + 1, by + y, bz, portalBlockZId);
      }

      // Keep both axis IDs present so both linked portals remain detectable.
      setSafe(bx, by + 2, bz, portalBlockZId);
      setSafe(bx + 1, by + 2, bz, portalBlockXId);
    }

    function ensureAnchorBuilt(anchor, retries = 8) {
      let attempts = 0;
      const run = () => {
        attempts++;
        buildPortalPlatform(anchor);
        buildLinkedPortal(anchor);
        if (attempts < retries) setTimeout(run, 120);
      };
      run();
    }

    function teleportToDimension(next) {
      const toDimension1 = next === 'dimension1';
      const destination = toDimension1 ? DIMENSION1_ANCHOR : OVERWORLD_ANCHOR;
      const result = teleportToCoordinates?.(destination.x + 4.5, destination.y + 2, destination.z + 0.5);
      if (result && result.ok === false) {
        showGameMessage?.(`Portal link failed: ${result.message || 'teleport unavailable'}`);
        return;
      }
      ensureAnchorBuilt(destination, 14);
      currentDimension = toDimension1 ? 'dimension1' : 'overworld';
      showGameMessage?.(toDimension1 ? 'Entering Dimension 1...' : 'Returning to Overworld...');
    }

    function onPortalCharged() {
      const next = currentDimension === 'overworld' ? 'dimension1' : 'overworld';
      teleportToDimension(next);
    }

    function init() {
      ensureAnchorBuilt(OVERWORLD_ANCHOR, 16);
      ensureAnchorBuilt(DIMENSION1_ANCHOR, 16);
    }

    return {
      init,
      onPortalCharged,
      getCurrentDimension: () => currentDimension,
      anchors: {
        overworld: { ...OVERWORLD_ANCHOR },
        dimension1: { ...DIMENSION1_ANCHOR },
      },
    };
  }

  window.SingleplayerDimension1World = { create };
})();
