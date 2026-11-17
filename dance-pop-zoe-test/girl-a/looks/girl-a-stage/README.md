Girl A – look "stage" (Bühnen-Outfit): cropped knit sweater + pleated skater mini skirt + white sneakers. Same structure as girl-a-pack-v3: frames/ masks/ skin/ (118 frames, 512x768 WebP, same ids/canvas/anchors/moves as base).
masks/: R=hair, G=Pullover (recolourable), B=Rock (recolourable); lossless. skin/: grayscale skin coverage, lossless. Sneakers, earrings and the ground shadow are not recoloured.
8 colour presets (Pullover/Rock): Minze & Flieder, Rosa & Weiß, Schwarz & Rot, Weiß & Navy, Gelb & Schwarz, Himmelblau & Weiß, Koralle & Creme, Lila & Silber (see girl-a-stage.json look.colorPresets). Hair style unchanged (long waves).
qa/ = review sheets (not part of the runtime pack).

v2 (2026-11-17, cleanup only, no new generations; same ids/anchors/JSON):
- Stronger sneaker lace-gap / shoe-hole fill: transparent gaps between laces and inside the white sneakers (background showing through, e.g. raised shoe in step-5/6, splits) are now opaque and inpainted. Limited to a neutral-white sneaker zone so hair edges, sweater and skirt are untouched.
