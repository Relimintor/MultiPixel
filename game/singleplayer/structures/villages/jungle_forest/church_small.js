(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'jungle_forest',
    pieceId: 'church_small',
    design: {
    "category": "church",
    "footprint": {
        "width": 9,
        "depth": 11
    },
    "wallHeight": 5,
    "doorDirs": [
        "N"
    ],
    "windowRows": [
        2,
        4
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
        },
        {
            "yOffset": 2,
            "inset": 2,
            "edgeOnly": false
        }
    ],
    "placeChest": false,
    "beamBlockId": 96
}
  });
})();
