(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'plains',
    pieceId: 'house_small',
    design: {
    "category": "house",
    "footprint": {
        "width": 7,
        "depth": 7
    },
    "wallHeight": 4,
    "doorDirs": [
        "N"
    ],
    "windowRows": [
        2,
        3
    ],
    "roofLayers": [
        {
            "yOffset": 0,
            "inset": 0,
            "edgeOnly": true
        },
        {
            "yOffset": 1,
            "inset": 1,
            "edgeOnly": false
        }
    ],
    "placeChest": true
}
  });
})();
