# Defender design

Defender is a first-person archery defense game. You are an archer on the walkway above a castle gate. A stone bridge crosses the moat to your gate, and waves of goblins rush across it to break the gate down. You shoot them before they reach it. The run ends when the gate falls.

This page is the lasting design: what the game is, how it should feel and look, and which layers come next. Numbers live in [tuning.ts](tuning.ts); this page explains intent, not values.

## References

These three paintings are the look and layout target. They are concepts, not specs: they fix the mood, palette, and composition, not the exact controls.

| | |
| --- | --- |
| ![First-person view down the bridge](reference/fps-bridge.jpg) | **First person.** The view the game must reach: bow in the lower right, battlements and braziers along the bottom edge, the bridge running straight away from you toward a sunny far bank, goblins readable at every distance. |
| ![Gate overlook](reference/gate-overlook.jpg) | **Gate overlook.** The space: a gate walkway between two towers, the bridge meeting the gate, the courtyard behind. |
| ![Top-down plan](reference/top-down-plan.jpg) | **Plan.** Layout proportions: the bridge width relative to the walkway, the moat ringing the castle, the courtyard behind the gate. |

## Look

**Target: soft, saturated, illustrated 3D.** Warm sun, cream stone, turquoise water, deep green grass, red banners with cream emblems. Gentle shading, soft shadows, no black ink outlines, no gritty realism. Characters are chunky and readable, with big silhouettes that read at 30 meters.

Rules for every art pass:

- **Read first.** A goblin must read as a goblin from the far end of the bridge. Silhouette and color beat detail.
- **Warm and bright.** The scene is a sunny afternoon. Shadows are soft and colored, never black.
- **Red marks the castle.** Red banners and accents belong to the defenders. Enemies stay green, brown, and iron.
- **Water is turquoise and bright.** It reflects the sky and catches sun glints. It never goes dark or murky.
- **The frame matters.** Battlements along the bottom, the bow in the lower right, the bridge as the central vanishing line. Keep this composition when adding content.

**Current state: greybox.** The scene is built from code primitives in the reference palette, with one sun, a sky fill, soft shadows, and a gradient sky. It is laid out to match the references but is not yet the final look. The look pass replaces materials and models while keeping the layout.

## Controls

Standard first-person archery. Mouse first; touch works but is not tuned.

| Input | Action |
| --- | --- |
| Mouse | Look and aim (pointer lock) |
| Hold left click | Draw the bow. Draw builds over time. |
| Release left click | Loose the arrow |
| Right click | Ease off without shooting. The arrow stays nocked. |
| WASD or arrow keys | Walk along the walkway. Slower while drawing. |
| Esc or P | Pause |

A quick tap still fires a weak arrow. After each shot there is a short nock delay before the next draw can start. Ammunition is unlimited.

Looking steeply down leans you out over the battlements, so you can shoot goblins hammering at the gate directly below you.

Touch: drag to look, hold the Draw button to pull, release to loose. No walking.

## Space

- **Walkway.** The top of the curtain wall above the gate, running between two towers. You walk freely inside it. You cannot fall, jump, or enter the towers.
- **Bridge.** A straight stone bridge, about two walkway widths wide, from the gate to the far bank. Goblins spawn at the far end and spread across its full width.
- **Gate.** A wooden door at the foot of the wall under you. Goblins that reach it stop and strike it.
- **Moat.** Bright water around the castle. Arrows that reach it are lost.
- **Far bank.** Grass, a dirt road, rocks, trees, and fences. Scenery only.
- **Courtyard.** Behind you, so turning around is still a place: enclosing walls, corner towers, a keep, stairs down from the walkway.

## Combat

- **Arrows are physical.** They fly with travel time, gravity, and air drag. Long shots need leading and a little elevation. Draw sets both speed and damage.
- **Arrows stick.** A hit in a goblin, the bridge, a wall, or the ground sticks for a few seconds, then disappears. An arrow stuck in a goblin rides with it. Each arrow hits once.
- **Goblins.** One kind for now. They hold a lane, spread out, funnel toward the door near the gate, and queue behind each other. At the gate they strike until killed. They never attack the player. Only the gate can fall.
- **Gate.** Has health. Each striking goblin wears it down. The gate darkens and shakes as it takes damage. At zero the run ends.

Physics uses Rapier as the collision world: static colliders for every surface, kinematic bodies for goblins. Arrow flight is integrated in code and swept with ray casts each step, which keeps hits exact at any speed and keeps the flight model easy to tune.

## Waves

The run is endless. Each wave sends more goblins with more health, more speed, and shorter gaps between spawns, up to fixed caps. When the last goblin of a wave falls, a short break counts down to the next wave. Standing still on wave 1 loses.

Best wave reached is saved in `localStorage`.

The wave break is a real game state. Upgrade choices will happen there.

## States

Ready → Playing → Wave break → Playing … → Game over. Pause can interrupt Playing or Wave break and returns to the same state. Losing pointer lock or hiding the tab pauses the game.

## Audio

Short synthesized cues: bow release (stronger with draw), hit, death, arrow sticking in stone, gate strike, wave horn, game over. No music yet.

## Built later

These are designed, not built. The current code leaves room for each.

- **Look pass.** Bring the scene to the references: stylized materials, water with reflections and glints, better goblin models, bow and hand models, banners that move.
- **XP and cards.** Kills give XP. A full bar gives a level, and level-ups are taken **during the wave break**, never mid-wave. Each level offers three random cards; pick one. Examples: more damage, faster draw, chance to multishot, piercing, faster nock.
- **Skills.** Every few levels, pick a new active skill on a cooldown: aimed shot, power shot, explosive shot, and more.
- **More enemies.** A shielded soldier who blocks frontal hits, and a slow brute with heavy health. Each is a new record beside the goblin. All stay on the bridge.
- **Win target.** An optional finite run, such as a set number of waves. The current game is endless.

Out of scope: side paths, allied tower archers, enemies swimming or climbing, and enemies attacking the player.

## Code map

| File | Role |
| --- | --- |
| [tuning.ts](tuning.ts) | Every number: layout, player, bow, arrow, goblin, waves, gate |
| [rules.ts](rules.ts) | Pure rules: draw curve, arrow speed and damage, lean, wave growth, gate damage |
| [castle.ts](castle.ts) | Greybox scene: castle, bridge, moat, banks, courtyard, lights, colliders |
| [goblin.ts](goblin.ts) | Goblin rig: walk, strike, hit flash, death, health bar |
| [bow.ts](bow.ts) | First-person bow and the shared arrow mesh |
| [world.ts](world.ts) | Rapier world, arrow flight, goblin steering, player movement, rendering |
| [audio.ts](audio.ts) | Synthesized sound cues |
| [game.ts](game.ts) | Game states, input, pointer lock, waves, gate, HUD |

`npm run test:defender` covers the pure rules.
