# Puzzle color design

Use color to describe the subject first. Give a piece a different color only when that color belongs on that part of the model. For the duck, the body and wing are yellow, the beak and feet are orange, and the eyes are dark. Do not add isolated accent colors just to make individual bricks easier to identify.

When a puzzle uses different colors, players must be able to tell them apart at a glance. Avoid near duplicates such as yellow and gold in the same model. If a distinct color would look unnatural on a part, use the model's main color there and let the brick's shape and placement hint guide the player.

Review the finished model and loose bricks in the actual game, including its lighting and shadows, at desktop and phone sizes. Check both that the colors are distinguishable and that their placement makes the subject recognizable.

# Snapforge construction and pile

Every new model and replay starts with **zero placed bricks**, showing `0 / total`. Never pre-place any part to reduce the build count: `0 / 100` or more is fine. Every part of the finished model must be placed by the player. The gallery and optional breakup animation may preview the finished model, but no solid pieces remain on the build field when fresh play begins. Continuing a saved build restores only the positions the player actually completed, in build order, even when interchangeable pieces were used.

For a pile larger than 30 pieces, expose at most three duplicates of each part (same color, footprint, and height, allowing quarter turns). Keep the rest in a hidden reserve, without meshes or physics bodies. Replenish a part when its available count falls below three, dropping replacements from above into the center of the pile. When the pile is below 30, drop any remaining reserved parts until it reaches 30 or the reserve is empty. Stagger these drops so they remain readable. Reserve parts still count toward the full model total and are never treated as placed. Holding or returning a part does not consume it.

Height-2 bricks replace directly stacked identical same-color pairs with one smooth-sided piece. They occupy two layers, have studs only on top, and count as one construction step. Heights default to 1 and are limited to 1 or 2. Matching requires equal height as well as color and footprint.
