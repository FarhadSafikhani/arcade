# Defender design

Defender is a first-person archery defense game, played alone or in co-op with up to four archers. You are an archer on the walkway above a castle gate. A stone bridge crosses the moat to your gate, and waves of goblins rush across it to break the gate down. You shoot them before they reach it. The run ends when the gate falls.

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

**Current state: illustrated blockout.** Stone, grass, timber, and cloth use painted textures. The moat is bright turquoise with ripples and sun glints. Models are still built from simple shapes: goblins, the bow, and the castle read by silhouette and color, not by sculpted detail.

## Controls

Standard first-person archery. Mouse first; touch works but is not tuned.

| Input | Action |
| --- | --- |
| Mouse | Look and aim (pointer lock) |
| Hold left click | Draw the bow. Draw builds over time. |
| Release left click | Loose the arrow |
| Right click | Ease off without shooting. The arrow stays nocked. |
| WASD or arrow keys | Walk the gate walkway and out onto either tower. Slower while drawing. |
| Q E R F G C or 1 to 6 | Use the active skill in that slot. Slots fill in the order you learn actives. |
| T or K | Open the skill trees. Solo play holds still while they are open; co-op does not. |
| Esc or P | Pause |

A quick tap still fires a weak arrow. After each shot there is a short nock delay before the next draw can start. Ammunition is unlimited.

Looking steeply down leans you out over the battlements, so you can shoot goblins hammering at the gate directly below you.

Touch: drag to look, hold the Draw button to pull, release to loose. No walking.

## Space

- **Walkway.** The top of the curtain wall above the gate. You walk freely inside it. You cannot fall or jump.
- **Towers.** Two open round platforms, one on each side of the gate, at the same height as the walkway and projecting out over the moat beside the bridge. You can walk onto them. From the rim you shoot down at the gate at an angle, which is how you get around shields. The parapet facing the gate is low. The outer rim keeps its merlons.
- **Bridge.** A straight stone bridge, about two walkway widths wide, from the gate to the far bank. Goblins spawn at the far end and spread across its full width.
- **Gate.** A wooden door at the foot of the wall under you. Goblins that reach it stop and strike it.
- **Moat.** Bright water around the castle. Arrows that reach it are lost.
- **Far bank.** Grass, a dirt road, rocks, trees, and fences. Scenery only.
- **Courtyard.** Behind you, so turning around is still a place: enclosing walls, corner towers, a keep, stairs down from the walkway.

## Combat

- **Arrows are physical.** They fly with travel time, gravity, and air drag. Long shots need leading and a little elevation. Draw sets both speed and damage.
- **Arrows stick.** A hit in a goblin, the bridge, a wall, or the ground sticks for a few seconds, then disappears. An arrow stuck in a goblin rides with it. Each arrow hits once.
- **Foes.** All of them stay on the bridge, hold a lane, and never attack the player. Only the gate can fall.
  - **Goblins** walk to the gate and strike it.
  - **Runners** are small and fast, and weave as they come.
  - **Shield bearers** block arrows coming into the front of the shield. A shot from the side or from behind, including from the towers, gets through. Arrows falling steeply from above also get through.
  - **Brutes** are slow, huge, and brutal on the gate.
  - **Casters** stop short of the gate and throw fire at it. Shoot the fire out of the air.
- **Experience.** One pool for the whole team, and the team levels together. Every foe must fall before the next wave, so a wave's experience is fixed, and level costs are pinned to it: each of the first ten waves pays at least one level, so the team is level 11 after wave 10. Past that, costs outgrow waves and levelling slows to about one every wave and a half by wave 13. In co-op each kill pays less, because bigger crowds bring more foes, so the team levels at the solo pace. `npx tsx scripts/xp-curve.ts` prints the curve.
- **Skill trees.** Two points per level, spent any time on two Diablo II style trees. Each tree has two paths of three skills and one ultimate. A skill opens at its tier's character level (1, 3, 6, 10) and with a point in the skill above it. The ultimate needs a point at the end of either path.
  - **Marksman, damage.** *Bleed path:* Barbed Arrows (hits bleed), Lingering Wounds (bleeds last longer, and bleeding foes take more), Ricochet (hits leap to the next foe, carrying the bleed). *Burst path:* Quick Hands (attack speed), Heavy Draw (full draws hit harder and shove), Power Shot (active: pierces the whole file, ignores shields). *Ultimate:* Rapid Fire, a buff worth +50% attack speed at max rank.
  - **Warden, control and support.** *Slow path:* Chilling Arrows (hits slow), Tar Pit (active: a slick that slows the crowd), Frostbite (chilled foes take more from everyone). *Support path:* Concussive Shot (active: stuns the target and those beside it), Mending Arrows (buff: arrows heal and fly through foes; each one that lands at the gate restores up to 10% of it), Shockwave (active: shoves the crowd at the gate back, stunned). *Ultimate:* Winter's Grip, which permanently makes every arrow a frost arrow; three hits within four seconds freeze a foe solid, and frozen shield bearers cannot block.
  - Archers have no health, since foes only ever attack the gate, so the gate is the ally Mending Arrows heals.
  - Running buffs show above the skill bar with a draining bar. Foes show what ails them: frost turns their skin icy, a bleed pulses red.
- **Gate.** Has health. Each striking goblin wears it down. The gate darkens and shakes as it takes damage. At zero the run ends.

Physics uses Rapier as the collision world: static colliders for every surface, kinematic bodies for goblins. Arrow flight is integrated in code and swept with ray casts each step, which keeps hits exact at any speed and keeps the flight model easy to tune.

## Waves

The run is endless. Each wave sends more foes, with more health, more speed, and shorter gaps between spawns, up to fixed caps. Runners join on wave 2, shield bearers on wave 3, brutes on wave 4, and casters on wave 5. When the last foe of a wave falls, a short break counts down to the next wave. Standing still on wave 1 loses.

Best wave reached is saved in `localStorage`.

The wave break is a real game state.

## States

Ready → Playing → Wave break → Playing … → Game over. Pause can interrupt Playing or Wave break and returns to the same state. Losing pointer lock or hiding the tab pauses the game. Choosing a card releases the mouse on purpose and does not pause.

Co-op adds a lobby: Ready → Lobby → Playing. In co-op, pausing only frees your mouse; the fight goes on. Anyone in the room can open the gate or start again after it falls.

## Co-op

Up to four archers hold one gate together. The server runs the only simulation (Colyseus, server-authoritative) and replicates it to every client.

- **Shared:** the gate, the wave, every foe, arrow, fire bolt, and oil slick.
- **Each archer's own:** position, skill points, skills, cooldowns, and buffs. The level is the team's; each archer spends their own points. Late joiners arrive with every point the team's level has earned.
- **More archers, bigger waves.** Each archer past the first adds 25% more foes (`WAVES.extraPerArcher`) and 80% more health to every foe (`WAVES.healthPerArcher`).
- **Feel.** Your own walking and aiming never wait for the network. Your arrow flies on your screen the moment you loose it, and the server's copy takes over where it lands. The server checks every stride and shot: no walking off the wall, no shooting faster than the nock allows, no draw longer than the time held.
- **Joining.** "Defend together" joins any open room. The room code goes into the page URL (`?room=`), so the address bar is the invite link. Late joiners start at level 1.

Solo play runs the same simulation in the page, with no server.

## Audio

Short synthesized cues: bow release (stronger with draw), hit, death, arrow sticking in stone, gate strike, wave horn, game over. No music yet.

## Built later

These are designed, not built. The current code leaves room for each.

- **Richer models.** Sculpted foes, a modeled bow and hand, banners that move. The painted textures and the water are in place; the meshes are still simple.
- **Win target.** An optional finite run, such as a set number of waves. The current game is endless.

Out of scope: side paths, allied tower archers, enemies swimming or climbing, and enemies attacking the player.

## Code map

| File | Role |
| --- | --- |
| [tuning.ts](tuning.ts) | Every number: layout, player, bow, arrow, foes, waves, gate, spells |
| [rules.ts](rules.ts) | Pure rules: draw, standing room, shields, waves, experience, gate damage |
| [skills.ts](skills.ts) | The two skill trees: every skill, its requirements, its effect by rank, and the shot it puts on an arrow |
| [tree.ts](tree.ts) | The skill tree sheet |
| [castle.ts](castle.ts) | Castle, bridge, moat, banks, courtyard, towers, lights, colliders |
| [look.ts](look.ts) | Painted textures and the moat shader |
| [goblin.ts](goblin.ts) | Foe rigs: goblin, runner, brute, shield bearer, caster |
| [bow.ts](bow.ts) | First-person bow and the shared arrow mesh |
| [sim.ts](sim.ts) | The whole run with nothing drawn: Rapier world, arrow flight, foe steering, spells, waves, cards, gate, every archer. Runs on the co-op server, or in the page for solo play |
| [world.ts](world.ts) | Rendering: draws any `WorldView`, smooths network motion, flies your own arrows ahead of the server |
| [archer.ts](archer.ts) | Other archers on the wall, with name tags |
| [net/schema.ts](net/schema.ts) | Replicated Colyseus state and client messages, shared by server and client |
| [net/link.ts](net/link.ts) | `LocalLink` (solo sim) and `NetLink` (co-op room) behind one interface |
| [audio.ts](audio.ts) | Synthesized sound cues |
| [game.ts](game.ts) | Screens, input, pointer lock, prediction of your own feet and bow, cards, HUD |
| [server/defender.ts](../../../server/defender.ts) | Co-op server entry: Colyseus on the game-host routes |
| [server/defender-room.ts](../../../server/defender-room.ts) | The room: runs a `DefenderSim` and mirrors it into the schema |

`npm run test:defender` covers the pure rules. `npm run server` starts the co-op server, and `npm run smoke:defender` plays two archers against it.
