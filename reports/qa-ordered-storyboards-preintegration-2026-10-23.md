# Ordered storyboard pre-integration QA — 2026-10-23

Scope: optional `playbackOrder` and 8-source-pose playback, before the three accepted images are registered in the product catalog. Tests and this report are the only QA-owned edits. This is **not** a final acceptance of their product integration or offline availability.

## Independent visual review of candidate originals

- `calf-raise-storyboard.png` (1536×1024, 4×2): all eight cells show a side-view double-leg calf raise. Both shoes start in floor contact and progressively rise onto the forefeet; the bilateral stance and heel lift are visible. The image supports an 8-pose forward path and a reversed return path. No concrete incorrect movement found.
- `band-external-rotation-left-storyboard.png` (1536×1024, 4×4): the working arm is the person's **left** (image right), with a red band extending from the other hand held near the navel. A white towel is visible under the working arm. The hand moves outward while the working elbow stays approximately by the side. Later frames reach the outward position; a reversed playback can show the return. No concrete incorrect movement found.
- `band-external-rotation-right-storyboard.png` (1536×1024, 4×4): mirrored working arm is the person's **right** (image left). The red band, other hand near the navel, underarm towel and outward rotation path are visible. No concrete incorrect movement found.

These are generated images; review establishes visible movement consistency and left/right identity, not exercise efficacy or clinical technique.

## Test evidence

- `npm run test:media`: **8/8 passed**. Added validator cases for source counts/columns, malformed and sparse order, wrong first source, missing source, out-of-range/fractional source, order over 64 steps, timing length/range and sparse timing. The accepted fixture labels eight source poses and 14 playback steps, while a legacy 16-source entry keeps its `16 格` label.
- Synthetic browser fixture: **1/1 passed**. An 800×400 4×2 SVG mounted through the actual media player showed square native cells, `400% 200%` sheet sizing, scrubber max 7, exact 0→1→…→7→6→…→1→0 timeline, 2-second total cycle, 0.5× timing, pause, source scrub to frame 7, ordered replay reset and stopped-controller cleanup. Caption said `8 張姿勢／往返播放 14 步`, never `16 格`.
- Existing 16-source browser suites (`new-mobility-media.spec.js`, `training-demo.spec.js`): **24/24 passed**, including the older help-modal, checkpoint, 375px layout and offline cache checks.

Pending after catalog integration: real PNG decode and native per-cell aspect, exact-name mapping and negative variants, real 14/30-step timings and captions, training/help pause/checkpoint preservation, service-worker offline cache for each new asset, and repository-wide checks by the parent.
