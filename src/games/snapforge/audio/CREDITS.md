# Snapforge sound credits

`music.mp3` is the looping Snapforge theme. It is not produced by the prepare script.

`breakup.mp3` is an original recording of the model coming apart at the start of a level. It is not produced by the
prepare script and has no third-party license.

The other effect clips in this folder are cut from Freesound's high-quality MP3 previews by `npm run prepare:snapforge-audio`
(`scripts/prepare-snapforge-audio.mjs`). The script prints the exact source range of each clip; the ranges below are
from the current cut. Those sources are CC0 and are credited on the Snapforge gallery screen.

| Clip | Used for | Source | License | Source range |
| --- | --- | --- | --- | --- |
| `snap.mp3` | Brick snapping into the build | [Disassembling two LEGO Bricks](https://freesound.org/people/LauraWebdev/sounds/257246/) by LauraWebdev, first event | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 0.075–0.210 s |
| `grab.mp3` | Picking a brick up from the pile | [Disassembling two LEGO Bricks](https://freesound.org/people/LauraWebdev/sounds/257246/) by LauraWebdev, second event | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1.066–1.211 s |
| `pour.mp3` | Bricks landing in the pile | [Lego falling on wooden floor](https://freesound.org/people/LiezelDippenaar/sounds/707543/) by LiezelDippenaar | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1.490–2.548 s |

Changes made to every prepared clip: trimmed to the range above, converted to mono, faded in and out, peak-levelled, and
re-encoded as MP3. `pour.mp3` is also boosted 7 dB through a limiter.
