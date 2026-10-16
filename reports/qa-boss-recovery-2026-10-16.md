# Independent QA — Boss recovery — 2026-10-16

**Final result: PASS on the updated working diff beyond `b154285`.** The confirmed retry defect below was fixed and independently rechecked. This reviewer did not run the combined browser suite or CI.

Scope: `js/ui/boss.js` and boot dispatch in `js/app.js`; supporting inspection of normal workout persistence, navigation guard, session awards, state storage, and the proposed Boss recovery tests. No product or test files were edited by this reviewer.

## Confirmed finding and fix: commit index mismatch

`readCheckpoint()` accepts `commit.index` anywhere from 0 through 100000, without checking its relationship to the current PR array. `alreadyRecorded()` checks only the tuple at that index, but the save handler appends using `push()`. When the target index differs from the append position, the tuple never becomes recognized.

Actual execution: imported the current Boss module body into an ephemeral in-memory harness, replacing its imports with DOM/storage/state stubs. Seeded a structurally accepted run result checkpoint with `commit.index:999`, `commit.value:1114`, and an empty PR array. `resumeBoss()` returned true. With `saveState()` returning false, the first save appended one PR and called `recordAndGain()` once; retry appended a second identical PR and called it a second time. This demonstrates duplicate PRs and repeated award invocation; the harness does not establish duplicate net XP because the real session layer deduplicates same-day awards.

The updated save handler now assigns `c.commit.index` to the actual PR array length and persists it before appending. Re-executed the actual updated module body in the same style of harness: restored index 999 rebased to 0; two failed saves followed by a successful retry produced exactly one PR and one award invocation, then removed the checkpoint. All assertions passed. The parent also reports the tests agent's browser regression with index 100000 passed; that browser execution is not claimed as this reviewer's execution.

## Other observations

- Normal failed-save retry with an unchanged tuple is guarded by `alreadyRecorded()`; successful-state/stale-draft reload also uses that guard.
- Timers restore paused, pause on visibility/pagehide, and remove listeners/timers when leaving the phase. Inputs persist separately and block navigation until save/cancel.
- Boot prioritizes Boss recovery, falling back to normal workout recovery. Ordinary Boss handoff clears the normal checkpoint first.
- Explicit product convention: PR retains the original test date; session/XP belongs to submission day. The updated UI displays the original date and discloses this convention when the dates differ. This is intentional, not a defect. The updated harness confirmed that cross-day disclosure is visible.
- The updated checkpoint validates an `interrupted` boolean. Timer pause, hidden/pagehide and restored timers mark it; affected timed result screens disclose that the result represents segmented timing before explicit self-reported PR saving. A second independent module-body harness confirmed restored HRP remains paused with no interval scheduled and persists interruption, and restored interrupted plank input shows the segmented-timing disclosure before saving. All assertions passed.
- Proposed tests cover normal reload, background pause, drafts, cancellation, malformed JSON/basic invalid data, expiration, failed main-state writes, and saved-state/stale-draft recovery. They were inspected, not executed here. Full combined browser execution and CI remain the parent's responsibility; these harnesses do not establish browser lifecycle or multi-tab storage behavior.
