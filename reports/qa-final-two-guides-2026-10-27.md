# Final dead bug and two-mile running guide QA — 2026-10-27

## Targeted result

**PASS** for the final two registered storyboard guides: `死蟲式` and `2 英里跑`. Their actual assets, library labels and controls, workout/Boss help, saved state, and offline cache were independently tested. The app now reports 71/71 exact planned guide names and 41 image assets; repository-wide CI remains the parent release gate.

## Independent visual review

- Dead bug final 4×4 original: orange wrist and ankle mark contralateral limbs in the first half; blue wrist and ankle mark the other contralateral pair in the second half. Source frame 8 is an intermediate position before the other side extends. Endpoint poses repeat as intended holds. No visible same-side pairing or extra limb was found.
- Running final `exec-16776074-2975-4f08-ae1a-51a7694db2b6.png` 4×4 original: orange left and blue right shoes remain consistent in all 16 cells. Frames 6–10 switch which leg comes forward and the near arm starts returning; foot contact and arm swing form a readable chronological gait cycle. No concrete visible defect was found. The guide explicitly calls this a mechanics illustration, not a two-mile distance substitute, pace, cadence or automatic count.

## Actual app checks

- Exact mapping: `死蟲式` resolves only to `dead-bug-storyboard.png`; `2 英里跑` resolves only to `running-storyboard.png`. Generic `原地跑`, numbered variants and other near names remain missing. HRP continues to use its own asset.
- Both 1254×1254 sheets decode and render square 4×4 cells. Scrubber source max is 15, last source reaches `100% 100%`; pause, slow and replay work. Dead bug's full actual browser timeline follows `0…7,6…0,8…15,14…8`, 30 steps at 200 ms = 6 seconds, and returns to source 0. Its label says 16 source poses and 30 sequential steps, not 30 unique pictures. Running uses 16 chronological source frames at 200 ms per step and keeps the legacy 16-frame label.
- In the Tuesday lower-body workout, dead bug help opened from the real step. Closing after 12 simulated seconds retained the exact step, remaining seconds and checkpoint sequence/index, paused until manual resume.
- Boss run result input's real `查看跑姿影格` button opens the exact running guide. Entered 18:42 remained after closing, reload and reopening; the unsaved Boss checkpoint retained both fields, with no PR added. The modal omits the training-timer pause claim because this run is externally timed. Cancelling removed the checkpoint and help handler/modal without recording a PR.
- Both assets are in the service-worker precache. After going offline and reloading, both guides decoded and opened in the library.

## Test record

- `final-ordered-guides.spec.js` **5/5 passed**. Together with `boss-hrp-media.spec.js` and the five earlier live ordered-guide tests: **16/16 passed**.
- Media unit suite: **8/8 passed**.
- Optional broadened browser run completed **41 passing tests** across Boss recovery, mobility, upper-back and training-demo coverage. Its remaining eight `training.spec.js` tests produced no output for more than three minutes; the run was stopped at 4.3 minutes. This is **not** a 49-test pass or a failure verdict for those eight. Full repository CI will determine that result.

Only `tests/**` and this `reports/qa-*.md` file were edited for this final QA pass; no product files or commits were made by QA.

## Full CI follow-up

The first full CI run reported 1039 passed, 8 skipped and one failure. The sole failure was an outdated assertion in the Sunday HRP end-to-end test: it expected the help button to be hidden. The approved Boss guide now intentionally shows that button and pauses the two-minute timer when opened. The test now opens the real guide, verifies the timer stays at 2:00 while help is shown and after closing, requires a manual resume, then completes its original 18-repetition PR flow. Because opening help interrupts the timer, the results page correctly displays the segmented-timing notice; that expectation was updated too. No product code changed.

Focused rerun: formerly failing HRP training test **1/1 passed**; related Boss HRP/Plank media suite **5/5 passed**. Full CI must be rerun by the parent for a repository-wide green result.
