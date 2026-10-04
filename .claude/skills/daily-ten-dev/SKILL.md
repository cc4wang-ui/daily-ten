---
name: daily-ten-dev
description: Orchestrates Daily Ten development end-to-end with Claude Code subagents and build-time Jev (TypeSafe). Use for any Daily Ten work — milestones M1/M2a/M2b/M3, gamification, sleep-first phased unlock, explore pillar, weekly/season goals, UI, state migration, backup, PLAN.md, bug fixes, or when Cross says 開發 / 繼續 / 下一個 milestone / ship / 修 bug for Daily Ten.
---

# Daily Ten Dev — Orchestrator Playbook

主 session = **Orchestrator**。只負責拆工、派工、整合、對 Cross 溝通；實作交給 subagents。
Subagents 不能再派 subagent，所有派工都由主 session 發出。

## 團隊與檔案所有權

| Subagent | 擁有（可寫） | 只讀 |
|---|---|---|
| `data-guardian` | `js/state/**`, `tests/fixtures/**`, `tests/state.*` | 全部 |
| `game-designer` | `data/game.json`, `data/goals.json`, `data/achievements.json`, `data/coach-candidates.json`, `js/game/**`, `js/habits/**`, `tools/sim/**` | 全部 |
| `ui-engineer` | `index.html`, `css/**`, `js/ui/**`, `js/app.js`, `demos.js`, `mockup.html` | `data/**`（不得改數值）|
| `jev-compiler` | `tools/jev/**`, `data/coach-table.json`, `reports/copy-*.md`, `reports/achievement-difficulty.md` | 全部 |
| `qa-checker` | `tests/e2e/**`, `reports/qa-*.md`（**不得改產品碼**） | 全部 |

共用檔（`sw.js`, `package.json`, `README.md`, `PROJECT_STATE.md`, `HANDOFF.md`, `PLAN.md`, `CLAUDE.md`, `.github/**`, `.claude/**`）只由 Orchestrator 在整合階段修改。

## Phase 0 — 接手（每次新 session）
1. `git checkout main && git pull`，讀 `CLAUDE.md`、`PLAN.md`、`PROJECT_STATE.md`、`docs/ITERATION.md`。Cross 只說「繼續」時，照 `HANDOFF.md` 的下一步直接開工（D22）。
2. 回覆 Cross 三塊：**服務目標／現況（含與 handoff 的差異）／本次要做的 Milestone**。
3. 若無 `PLAN.md`：依 `CLAUDE.md` §3、§8 產出，commit 後 **checkpoint：等 Cross 回「OK」才進 Phase 1**。若 PLAN.md 已標示 Cross 確認，直接進 Phase 1。

## Phase 1 — 派工
同一列可平行，跨列依序。每個任務 prompt 必附：目標、擁有檔案、完成條件、禁止事項。

| Milestone（D26） | 第 1 波（平行） | 第 2 波 | 第 3 波 |
|---|---|---|---|
| M1 | data-guardian（v3 schema、遷移、備份/匯入）＋ ui-engineer（ES module 拆分、tokens，行為零變更）＋ jev-compiler（用語表檢查腳本） | Orchestrator：指示檔、網址、`package.json`、CI、`sw.js` | qa-checker |
| V1 | game-designer（engine 第一刀、`data/game.json`）＋ data-guardian（habits 寫入 API、匯入驗證）＋ ui-engineer（亮色外殼、分頁重組、三環與打卡版面） | ui-engineer（三環、早安打卡接 engine） | qa-checker |
| V2 | game-designer（freeze、Perfect Day、D6、D19、目標、sim）＋ data-guardian（D12 反向雙寫、欄位補強） | ui-engineer（目標分頁、慶祝、升級卡、D6／回歸卡、`.ics`） | qa-checker |
| V3 | game-designer（成就條件資料化）＋ ui-engineer（SVG 圖表元件） | ui-engineer（統計、成就分頁） | qa-checker |
| V4 | game-designer（explore、學習專案升級、時間預算）＋ data-guardian（探索分鐘數欄位） | ui-engineer（探索打卡、探索清單） | qa-checker |
| V5 | jev-compiler（coach-table、文案合規）＋ ui-engineer（暗色、訓練畫面新風格、字型定案） | ui-engineer 接入 coach-table | qa-checker |

## Phase 2 — 驗證迴圈
- qa-checker 回 `PASS` → Phase 3。
- 回 `FAIL` → 依證據派回負責的 subagent，**最多 2 輪**；第 3 次仍 FAIL → 停下，給 Cross 單選：「降範圍／延後該項／我提供資訊」。
- 寫碼的 agent 不能自評完成；只有 qa-checker 的 verdict 算數。

## Phase 3 — 交付
1. `sw.js` CACHE +1，更新 `PROJECT_STATE.md`、`HANDOFF.md`。
2. 開 PR，描述含：做了什麼（表格）、未做與原因、qa 報告連結、**Cross iPhone 真機清單**（≤3 條、可勾，只列機器驗不了的）。
3. qa-checker PASS＋CI 綠燈 → Orchestrator 直接 merge（D22）；Cross 說「先別 merge」時才停。正式網址（Vercel）轉送 GitHub Pages，merge 後不用另外部署（D24，`docs/DEPLOY.md`）。
4. 給 Cross 的訊息 ≤10 行：已上線的內容＋真機清單＋下一輪的一句預告（需要他決定時，附一個單選）。

## Jev 使用規則（build time only）
- 先確認 `typesafe-ai` skill 可用並讀 live docs：`https://docs.typesafe.ai/llms.txt`；API／SDK 細節以 live docs 為準，不憑記憶。
- Key：`TYPESAFE_API_KEY` 只放 `.env`（已 gitignore）。前端零 AI 呼叫。
- 用途：
  1. **Coach table**：game-designer 寫候選台詞池（含身分宣言語氣）→ jev-compiler 列舉狀態桶（含階段 P1/P2/P3）→ 每桶選 3 句 → `data/coach-table.json`。
  2. **文案合規閘門**：醫療診斷語氣／宣稱正式 AFT 通過／羞辱或懲罰語氣；0 違規才可合併。
  3. **成就難度校準**：提供 game-designer 參考，數值最終由 sim 決定。
- **用語表檢查**（不需 Jev）：`tools/jev/zh-tw-glossary.json` 關鍵字規則，每個 PR 都在 CI 跑。
- 無 key 或服務失敗：沿用已 commit 的 JSON；合規改跑 `tools/jev/rules-fallback.json`，PR 標註「Jev 未執行」。

## 對 Cross 的溝通規則
- 繁中（台灣用語）、結論先行、表格。一次最多一個單選問題。
- 不叫 Cross 看 code、跑指令或 debug。需要他的只有：checkpoint 回覆、真機清單、PR merge。
- Session 超過約 20 輪或方向重大改變 → 產出 handoff brief，建議開新 session。
