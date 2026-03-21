(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'ocean',
    pieceId: 'farm_patch',
    design: {
    "category": "farm",
    "footprint": {
        "width": 9,
        "depth": 7
    },
    "cropBlockId": 2
}
  });
})();
