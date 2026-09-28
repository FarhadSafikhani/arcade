# Snapforge brick design

This page is the rule set for how Snapforge bricks are made and how their design works. It states lasting constraints: color, construction, shape, connection, packing, and review. It is not a journal of changes, a catalog of models, or a place for editorial notes.

# Puzzle color design

Use color to describe the subject first. Give a piece a different color only when that color belongs on that part of the model. For the duck, the body and wing are yellow, the beak and feet are orange, and the eyes are dark. Do not add isolated accent colors just to make individual bricks easier to identify.

When a puzzle uses different colors, players must be able to tell them apart at a glance. Avoid near duplicates such as yellow and gold in the same model. If a distinct color would look unnatural on a part, use the model's main color there and let the brick's shape and placement hint guide the player.

Review the finished model and loose bricks in the actual game, including its lighting and shadows, at desktop and phone sizes. Check both that the colors are distinguishable and that their placement makes the subject recognizable.

# Snapforge construction and pile

Every new model and replay starts with **zero placed bricks**, showing `0 / total`. Never pre-place any part to reduce the build count: `0 / 100` or more is fine. Every part of the finished model must be placed by the player. The gallery and optional breakup animation may preview the finished model, but no solid pieces remain on the build field when fresh play begins. Continuing a saved build restores only the positions the player actually completed, in build order, even when interchangeable pieces were used.

For a pile larger than 30 pieces, expose at most three duplicates of each part (same color, footprint, and height, allowing quarter turns). Keep the rest in a hidden reserve, without meshes or physics bodies. Replenish a part when its available count falls below three, dropping replacements from above into the center of the pile. When the pile is below 30, drop any remaining reserved parts until it reaches 30 or the reserve is empty. Stagger these drops so they remain readable. Reserve parts still count toward the full model total and are never treated as placed. Holding or returning a part does not consume it.

Height-2 bricks occupy two layers, have smooth sides and studs only on top, and count as one construction step. Heights default to 1 and are limited to 1 or 2. Matching requires equal height as well as color and footprint. Design height and footprint together: two layers do not need identical existing seams to be replaced by a larger height-2 brick.

# Snapforge model design system

**Recognize ? Sculpt ? Connect ? Pack ? Review.** The LLM designs the subject; the compiler chooses exact bricks. Work from a shape recipe, not a hand-written brick list. See [AUTHORING.md](../src/games/snapforge/AUTHORING.md) for the recipe format, commands, and versioning.

1. **Recognize.** State the subject, target N, symmetry plane, and 2–3 features that make it unmistakable. For a turtle: domed shell, low body with four legs, projecting head. Choose a small subject-appropriate palette. These features are the design's priorities.
2. **Sculpt.** Block out named volumes from large masses to small details. Check front, side, and top proportions before adding eyes or decoration. If the plain silhouette fails, fix the proportions. Mirror paired features by construction; do not approximate each side independently. Resolution means useful contour and recognition, not voxel count.
3. **Connect.** Design a coherent first piece and a readable route from foundation to body to details. Prefer top-side construction: place bricks on top of already supported pieces. Use underside attachment when it naturally fits a hanging feature, such as a tail, rope, vine, or dangling ornament. Mark those volumes with `attachment: "underside"`, build their anchor first, then attach the hanging pieces downward. Every piece must remain stud-connected and its attachment must already be placed. Where an appendage only touches a side, redesign its attachment. Never patch the shape with scattered single-cell support posts.
4. **Pack.** Compile the exact colored shape using broad rectangles and heights 1 and 2 together. Inspect custom sizes, small pieces, stacked layers, and merge opportunities. **Every split must earn its place through shape, color, symmetry, connection, or a clearer assembly.** Protect only justified feature boundaries; protection is not a way to inflate the count.
5. **Review.** Run the authoring checks, then inspect the actual gallery, loose pile, first steps, and completed build from all four resting views at desktop and phone sizes. Ask: *Does it read without its title? Are both sides intentional? Does the build make sense? Can any seam disappear without losing something useful?* Fix the cause in the recipe and repeat. Passing geometry checks does not establish visual quality.

**Budget:** Each model has a positive integer `targetParts` N; allow **N ±2** and increase targets deliberately through a collection. Over budget: remove unnecessary seams first, then simplify low-value detail. Under budget: improve a meaningful contour or defining feature. Never split clean bricks or add decoration solely to reach N. If quality and budget cannot both be met, report the conflict rather than disguising it.

**Symmetry:** Models must be symmetric when the subject warrants it: shape, colors, paired features, and brick seams. Document intentional poses or asymmetric features as narrowly scoped exceptions with a reason.

**Parts:** Prefer familiar rectangles, including quarter turns. Allow custom integer footprints when an odd width or long thin piece improves shape or construction. Ordinary brick heights remain 1 or 2. A wheel is one atomic 3×1 h3 part (or rotated), with a tire and hub, connected sideways at axle height. Its tire radius is 1.3 world units, and its center stays fixed relative to the part. Changing the packing must preserve occupied shape and colors; changing the shape is a separate design decision.

**Handoff:** Report actual/N pieces, defining features, justified custom parts or exceptions, checks performed, and any remaining visual limitations. Leave new or changed generated models at **`vetted: 0`**. Only an explicit user request may promote them to 1; unchanged regeneration preserves that decision. Vetting never affects unlocking or gallery visibility.

An existing piece count is not an approved design. Redesign a model individually through this loop.
