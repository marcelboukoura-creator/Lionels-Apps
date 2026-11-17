Girl A – look "casual" (Freizeit-Outfit): open oversized white denim jacket over a lilac crew-neck t-shirt + teal high-waisted wide-leg trousers + white sneakers. Same structure as girl-a-pack-v3: frames/ masks/ skin/ (118 frames, 512x768 WebP, same ids/canvas/anchors/moves as base).
masks/: R=hair, G=Jacke (recolourable), B=Hose (recolourable); lossless. skin/: grayscale skin coverage, lossless. T-shirt (lilac), sneakers, earrings and the ground shadow are fixed (not recoloured).
8 colour presets (Jacke/Hose): Weiß & Petrol, Jeansblau & Schwarz, Schwarz & Beige, Rosa & Weiß, Oliv & Creme, Gelb & Navy, Lila & Grau, Rot & Schwarz (see girl-a-casual.json look.colorPresets). Hair style unchanged (long waves).
Back views (spin-4/5/6) generated with a dedicated back-view prompt (jacket back yoke, no front details).
Cutout/mask rules on top of the shared pipeline: sneaker-only lace/hole fill; sneakers excluded from the white-jacket slot (base sneaker zone); green irises excluded from the trouser slot; jacket visible through hair gaps -> Jacke; shaded ankle skin -> skin.
Known minor: faint pale hair-edge wisps in spin-8 (same as stage/dress, base trait).
qa/ = review sheets (not part of the runtime pack).
