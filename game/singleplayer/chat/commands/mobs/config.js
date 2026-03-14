(function () {
  const categories = window.SingleplayerMobData?.categories || {};
  const byId = {};

  for (const categoryName of Object.keys(categories)) {
    const categoryEntries = categories[categoryName] || {};
    for (const mobKey of Object.keys(categoryEntries)) {
      const mob = categoryEntries[mobKey];
      if (!mob || !Number.isFinite(mob.id)) continue;
      byId[mob.id] = {
        id: mob.id,
        key: mob.key,
        name: mob.name,
        category: mob.category,
      };
    }
  }

  window.SingleplayerMobConfig = { byId, categories };
})();
