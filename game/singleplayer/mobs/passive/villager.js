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
        { priority: 1, key: 'observe', label: 'LookAroundGoal', description: 'Looks around when idle' },
        { priority: 2, key: 'wanderHome', label: 'VillageHomeWanderGoal', description: 'Wanders around home building interior' },
      ],
    },
  };
})();
