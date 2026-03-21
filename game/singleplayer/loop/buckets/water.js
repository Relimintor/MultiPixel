(function () {
  const EMPTY_BUCKET_ID = 115;
  const WATER_BUCKET_ID = 116;
  const WATER_SOURCE_ID = 4;
  const WATER_FLOW_START_ID = 47;
  const WATER_FLOW_END_ID = 53;
  const GLOWSTONE_ID = 119;
  const GLOWSTONE_PORTAL_Z_ID = window.SingleplayerSideConfig?.GLOWSTONE_PORTAL_Z_ID || 147;
  const GLOWSTONE_PORTAL_X_ID = window.SingleplayerSideConfig?.GLOWSTONE_PORTAL_X_ID || 148;

  function isReplaceablePortalCell(blockId) {
    return blockId === 0
      || blockId === WATER_SOURCE_ID
      || (blockId >= WATER_FLOW_START_ID && blockId <= WATER_FLOW_END_ID)
      || blockId === GLOWSTONE_PORTAL_Z_ID
      || blockId === GLOWSTONE_PORTAL_X_ID;
  }

  function matchesGlowstonePortalFrame(getBlock, origin, axis, startA, startY) {
    for (let dy = 0; dy < 3; dy++) {
      for (let da = 0; da < 2; da++) {
        const wx = axis === 'x' ? startA + da : origin.wx;
        const wz = axis === 'z' ? startA + da : origin.wz;
        if (!isReplaceablePortalCell(getBlock(wx, startY + dy, wz))) return false;
      }
    }

    for (let da = -1; da <= 2; da++) {
      const bottomX = axis === 'x' ? startA + da : origin.wx;
      const bottomZ = axis === 'z' ? startA + da : origin.wz;
      if (getBlock(bottomX, startY - 1, bottomZ) !== GLOWSTONE_ID) return false;
      if (getBlock(bottomX, startY + 3, bottomZ) !== GLOWSTONE_ID) return false;
    }

    for (let dy = 0; dy < 3; dy++) {
      const leftX = axis === 'x' ? startA - 1 : origin.wx;
      const leftZ = axis === 'z' ? startA - 1 : origin.wz;
      const rightX = axis === 'x' ? startA + 2 : origin.wx;
      const rightZ = axis === 'z' ? startA + 2 : origin.wz;
      if (getBlock(leftX, startY + dy, leftZ) !== GLOWSTONE_ID) return false;
      if (getBlock(rightX, startY + dy, rightZ) !== GLOWSTONE_ID) return false;
    }

    return true;
  }

  function fillGlowstonePortal(setBlock, origin, axis, startA, startY) {
    const portalBlockId = axis === 'x' ? GLOWSTONE_PORTAL_Z_ID : GLOWSTONE_PORTAL_X_ID;
    for (let dy = 0; dy < 3; dy++) {
      for (let da = 0; da < 2; da++) {
        const wx = axis === 'x' ? startA + da : origin.wx;
        const wz = axis === 'z' ? startA + da : origin.wz;
        setBlock(wx, startY + dy, wz, portalBlockId);
      }
    }
    return true;
  }

  function tryCreateGlowstonePortal(ctx, place) {
    const getBlock = typeof ctx.getBlock === 'function' ? ctx.getBlock : () => 0;
    const setBlock = typeof ctx.setBlock === 'function' ? ctx.setBlock : () => false;

    for (let startX = place.wx - 1; startX <= place.wx; startX++) {
      for (let startY = place.wy - 2; startY <= place.wy; startY++) {
        if (matchesGlowstonePortalFrame(getBlock, place, 'x', startX, startY)) {
          return fillGlowstonePortal(setBlock, place, 'x', startX, startY);
        }
      }
    }

    for (let startZ = place.wz - 1; startZ <= place.wz; startZ++) {
      for (let startY = place.wy - 2; startY <= place.wy; startY++) {
        if (matchesGlowstonePortalFrame(getBlock, place, 'z', startZ, startY)) {
          return fillGlowstonePortal(setBlock, place, 'z', startZ, startY);
        }
      }
    }

    return false;
  }

  function tryInteract(ctx) {
    if (!ctx) return false;
    const heldItemId = Number(ctx.heldItemId);
    const target = ctx.targetPos || {};
    const place = ctx.placePos || {};
    const targetBlockId = Number(ctx.targetBlockId);
    const getBlock = typeof ctx.getBlock === 'function' ? ctx.getBlock : () => 0;
    const setBlock = typeof ctx.setBlock === 'function' ? ctx.setBlock : () => false;
    const setSelectedItem = typeof ctx.setSelectedItem === 'function' ? ctx.setSelectedItem : () => false;
    const showGameMessage = typeof ctx.showGameMessage === 'function' ? ctx.showGameMessage : () => {};

    if (heldItemId === EMPTY_BUCKET_ID && targetBlockId === WATER_SOURCE_ID) {
      if (!setBlock(target.wx, target.wy, target.wz, 0)) return false;
      setSelectedItem(WATER_BUCKET_ID, 1);
      showGameMessage('Filled bucket with water.');
      return true;
    }

    if (heldItemId !== WATER_BUCKET_ID) return false;

    if (getBlock(place.wx, place.wy, place.wz) !== 0) return false;
    if (!setBlock(place.wx, place.wy, place.wz, WATER_SOURCE_ID)) return false;

    const createdPortal = tryCreateGlowstonePortal(ctx, place);
    setSelectedItem(EMPTY_BUCKET_ID, 1);
    showGameMessage(createdPortal ? 'Glowstone portal activated.' : 'Placed water.');
    return true;
  }

  window.SingleplayerWaterBucket = { tryInteract, tryCreateGlowstonePortal };
})();
