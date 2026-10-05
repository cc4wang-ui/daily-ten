# QA 驗收報告 — V1 亮色外觀＋三環＋早安打卡（第 2 輪）

| 項目 | 內容 |
|---|---|
| 受測 | `v-next/b1` @ `7a43810`（data-guardian「QA V1 BUG-1: import preview lists only stored facts」，在第 1 輪的 `4a91248` 之上；只改 `js/state/backup.js`、`tests/state.backup.spec.js`） |
| 環境、指令 | 同第 1 輪（[qa-v1-1.md](./qa-v1-1.md)）：`QA_UPGRADE_PORT=4710 PORT=4620 PARITY_BASE_DIR=<scratchpad>/main-ref UPGRADE_BASE_DIR=<scratchpad>/wt/gap npx playwright test`，2 workers |

## Verdict：`PASS`

- 全套 **740 passed／0 failed**（單元 505＋e2e 235，5.9 分，exit 0；`<scratchpad>/qa-b1/full-run-r2.txt`）。
- `check-repo` 通過（App 檔 47、預快取 48 項、CACHE v9 > main v8）；用語表新增 0、既有 0（41 檔、935 筆）。
- 第 1 輪的唯一缺陷 **BUG-1 已修好**：匯入預覽只列存檔裡的事實，XP、連續天數、最佳連續三列移除，`level` 列改名「課表強度」（值仍是 `L3`，不再和中央的「Lv N」同名）。第 1 輪的 BUG-1 測試（`v1-today`「匯入預覽：不顯示舊尺度的 XP」）不改就通過。

## 第 2 輪改了什麼（只改測試，跟著 Orchestrator 的決定）

預覽固定 8 列：版本／課表強度／最後訓練日／訓練紀錄筆數／PR 筆數／身體指標筆數／睡眠紀錄筆數／最後備份；警告不變。

| 檔案 | 改法 |
|---|---|
| `import.spec.js` | 預期表改 8 列（`['level','課表強度','L3','L3',false]`，刪 xp／streak／bestStreak）；原本用 `rows[2]`（XP 列）的兩項改用 key 找列：v2-real → v3 檢查「最後訓練日 2026-09-28 → 2026-10-01」與「訓練紀錄筆數 32 → 35 筆」，v3 → v1 檢查「2026-10-01 → 2026-08-05」與「35 → 3 筆」，並檢查列的順序 |
| `backup.spec.js` | 自己的備份匯回：8 列全部「不變」（原本 11） |
| `relocate.spec.js` | 新網址匯入預覽改查「課表強度 L2 → L3」「最後訓練日 — → 2026-09-28」，並確認沒有 XP 列 |

其餘項目（Phase A／B、DoD、退役清單、植入缺陷、真機清單）與第 1 輪相同，見 [qa-v1-1.md](./qa-v1-1.md)。DoD 1（`npm test` 全綠）與 6（qa-checker PASS）本輪改為 PASS；DoD 4、7 仍待 Orchestrator 在 PR 時補。

## 附帶（不影響判定）

- `tests/fixtures/README.md` 第 2 節「好檔的差異摘要」還寫舊的 11 列（等級、XP、連續天數、最佳連續），和程式不一致；那是 data-guardian 的檔，建議順手更新。
