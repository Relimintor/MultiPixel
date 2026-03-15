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
        { priority: 10, key: 'observe', label: 'LookAroundGoal', description: 'Looks around when idle' },
        { priority: 11, key: 'wanderHome', label: 'VillageHomeWanderGoal', description: 'Wanders around home building interior' },
      ],
      poiCategories: ['well', 'bed', 'bell'],
      indoorShelter: { type: 'home' },
    },
  };
})();
