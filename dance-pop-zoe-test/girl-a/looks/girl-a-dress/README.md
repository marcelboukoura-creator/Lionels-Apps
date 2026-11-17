Girl A – look "dress" (Alltagskleid). Same structure as girl-a-pack-v3: frames/ masks/ skin/ (118 frames, 512x768 WebP, same ids/canvas/anchors/moves as base).
masks/: R=hair, G=Kleid (recolourable slot), B=0 (unused); lossless. skin/: grayscale skin coverage, lossless. Sneakers/earrings/bare arms+legs are not recoloured.
8 approved colours: Rosa, Navy, Mint, Gelb, Weiß, Schwarz, Koralle, Himmelblau (see girl-a-dress.json look.approvedColors). Hair style unchanged (long waves).
qa/ = review sheets (not part of the runtime pack).

v2 (2026-11-17, cleanup only, no new generations; same ids/anchors/JSON):
- Sneaker holes filled (shoe-zone gated): transparent holes and lace gaps inside the white sneakers (shoe body showed the background) are now opaque and inpainted (largest: jump-2, kick-5, step-6, splits-2/4, moonwalk-17, spin-6).
- Sneakers never recoloured: small neutral/white islands below or far from the dress (raised/kicked/splits shoes) are removed from G.
- Cleaner hair: pale hair-tip specks and skin patches inside the hair mass relabelled as hair; tiny dress islands inside hair -> hair.
- Skin outline rim along arms/legs now counts as skin; bright matte fringe at the silhouette edge tightened and defringed.
