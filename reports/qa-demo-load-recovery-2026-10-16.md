# Independent QA — demo load recovery — 2026-10-16

**Result: PASS for the inspected loader changes.** No concrete regression found. This is a code review and focused harness result; browser execution and new-branch CI remain pending.

Scope: the working changes on `codex/demo-load-recovery` in `js/ui/exercise-media.js`, plus the proposed browser cases in `tests/e2e/training-demo.spec.js`. No product files were edited by this reviewer.

Code inspection confirmed:

- Image load and decode must succeed, with nonzero natural dimensions, before frames and controls become available.
- Attempt tokens invalidate stale load/decode callbacks; `stop()` also clears timers, removes image handlers and control handlers, and removes the storyboard.
- Retry retains the exact local asset URL, preserving compatibility with the service-worker cache.
- Reduced-motion preference initializes playback paused; loading does not change that state.
- The existing global `[hidden]{display:none!important}` rule prevents control layout styles from exposing loading controls.
- A 15-second watchdog exposes recovery for stalled requests. The service-worker cache version advances to v20.

Actual execution: imported the current module into an ephemeral, in-memory DOM/image/timer harness and asserted hidden preload controls, successful reduced-motion startup without a frame timer, late decode completion after stop, decode rejection, same-URL retry, timeout recovery, and timer cleanup. All assertions passed. This harness does not establish browser network/cache behavior or rendering.

The proposed browser tests were inspected, not executed by this reviewer. They cover request failure and retry while preserving the paused workout checkpoint, and delayed completion of an old image after another movement opens. The parent will run the browser suite; CI for this branch has not run yet. No offline retry claim is inferred solely from the same-URL assertion.
