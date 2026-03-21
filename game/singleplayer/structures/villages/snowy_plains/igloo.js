(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'snowy_plains',
    pieceId: 'igloo',
    design: {
    "category": "igloo",
    "footprint": {
        "width": 7,
        "depth": 7
    },
    "windowBlockId": 80,
    "structure": {
        "tokens": {
            "#": "wall",
            ".": "floor",
            "w": "window",
            "=": "roof",
            "c": "chest",
            " ": "air"
        },
        "layers": [
            {
                "yOffset": 0,
                "rows": [
                    "  ...  ",
                    " ..... ",
                    ".......",
                    "...c...",
                    ".......",
                    " ..... ",
                    "  ...  "
                ]
            },
            {
                "yOffset": 1,
                "rows": [
                    "  ##   ",
                    " ## ## ",
                    "##   ##",
                    "#     #",
                    "#  w  #",
                    " ## ## ",
                    "  ###  "
                ]
            },
            {
                "yOffset": 2,
                "rows": [
                    "  ==   ",
                    " == == ",
                    "==   ==",
                    "=  w  =",
                    "=     =",
                    " == == ",
                    "  ===  "
                ]
            },
            {
                "yOffset": 3,
                "rows": [
                    "   =   ",
                    "  ===  ",
                    " ===== ",
                    "==   ==",
                    " ===== ",
                    "  ===  ",
                    "   =   "
                ]
            },
            {
                "yOffset": 4,
                "rows": [
                    "       ",
                    "   =   ",
                    "  ===  ",
                    "  ===  ",
                    "  ===  ",
                    "   =   ",
                    "       "
                ]
            }
        ]
    },
    "placeChest": false,
    "doorDirs": [
        "N"
    ]
}
  });
})();
