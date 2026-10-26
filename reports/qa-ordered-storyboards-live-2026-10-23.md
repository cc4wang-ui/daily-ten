# Five ordered storyboard guides — independent live QA, 2026-10-23

## Result

**PASS** for the five registered guides: 提踵, 單腳提踵 · 左, 單腳提踵 · 右, 彈力帶肩外旋 · 左, 彈力帶肩外旋 · 右. This report covers their actual catalog entries, images, library and workout help, offline cache, and related regression tests. Dead bug and the two-mile run remain outside this acceptance because no guide is registered for them.

## Visual evidence

- The bilateral calf image shows both feet progressing from grounded heels to raised heels.
- The single-leg left original shows one support foot rising while the other foot remains off the floor; the orange ankle marker is on the support side and the blue ankle marker is on the free side. The right original mirrors the support/free-leg roles, with blue on the support ankle and orange on the free ankle. Both images retain one support leg throughout all eight source cells; the caption correctly does not instruct a midway leg switch. Viewed at original 1536×1024 resolution.
- Both shoulder external-rotation originals show a red band held by the opposite hand in front of the abdomen, a white towel under the working upper arm, and the working forearm moving outward with elbow staying approximately beside the torso. The left/right working arms are visually distinguishable. No concrete incorrect movement was found in these five images.

## Browser and code evidence

- The five names resolve to five distinct exact assets. Similar but unsupported variants and generic names remain unavailable. Boss warm-up includes 提踵; lower-body block includes both single-leg sides; banded pull block includes both external-rotation sides.
- All five images decoded from the real catalog. The 1536×1024, 4×2 source sheets rendered as **0.75 aspect-ratio cells**; 4×4 sheets rendered as **1.5 aspect-ratio cells**. Source scrubber maxima were 7 and 15 respectively, and dragging to the final source cell reached `100% 100%` background position. Pause, slow, and ordered replay reset operated in the real library modal. Labels distinguish eight source poses/14 playback steps and 16 source poses/30 playback steps; they do not claim 14 or 30 unique pictures.
- The registered orders are exactly `0…7,6…1` and `0…15,14…1`. Timing arrays have 14 and 30 steps summing to two and three seconds. On the real calf and external-rotation images, browser fake time independently observed every forward and reverse source step and the return to frame zero at exactly those cycle durations.
- Actual Tuesday lower-body and Wednesday banded-upper-body workouts opened all four sided guides. After 12 seconds inside help, closing returned to the same step, count, phase and unchanged checkpoint sequence/index/completion, paused until the user resumes.
- All five assets are in the service-worker precache. After switching the browser offline and reloading, the library decoded and opened each guide.

## Runs

- `ordered-guides-live.spec.js`: **6/6 passed**.
- `new-mobility-media.spec.js` and `upper-back-media.spec.js` with stale negative expectations corrected only for the newly approved exact names: **14/14 passed**; together with the first live run, **20/20 passed**.
- Earlier in the same QA pass: ordered synthetic browser fixture **1/1 passed**, existing `new-mobility-media.spec.js` and `training-demo.spec.js` **24/24 passed**, media units **8/8 passed**.

The parent owns the repository-wide CI and release decision.
