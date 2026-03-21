(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'plains',
    pieceId: 'well',
    design: {
    "category": "well",
    "footprint": {
        "width": 7,
        "depth": 7
    },
    "radius": 2,
    "waterRadius": 0,
    "pillarHeight": 3,
    "roofRadius": 1,
    "roofHeight": 1,
    "pillarOffset": 1
}
  });
})();
