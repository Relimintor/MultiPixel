(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'oak_forest',
    pieceId: 'farm_patch',
    design: {
    "category": "farm",
    "footprint": {
        "width": 9,
        "depth": 7
    }
}
  });
})();
