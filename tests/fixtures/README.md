# State fixtures（擁有者：data-guardian）

qa-checker 依這份寫 e2e。所有預期值都已由 `tests/state.*.spec.js` 驗證（單元測試裡的 `EXPECTED` 表與本檔相同）。

- 格式來源：v1 = `addc5be:index.html`、v2 = `ec87e03:index.html`。`v2-real`／`v3`／`v3-reverted-to-v2` 是**重播真實 App 的 `recordSession`／`logMetric`／Boss 流程**產生的，所以 `xp`、`streak` 與 `sessions` 完全一致（xp = sessions.xp 加總；streak = 連續出席天數）。
- 檔案是靜態資料，不要重新產生；schema 改版時另加新 fixture。
- 載入方式：把檔案**原文**寫進 `localStorage['daily-ten-state']`（例如 `page.addInitScript`）後開 App。
- 「現在」：單元測試用 `2026-10-02T15:30:00+09:00`（Asia/Tokyo）。v1／v2 遷移時新建的 DJ 探索項目 `createdAt` = 載入當下時間，其餘結果與時間無關。

## 1. 載入（`loadState()`）與遷移結果

`game.xp.sleep`、`game.xp.explore` 一律為 0；`game.xp.total = move + sleep + explore`；`game.streaks.train` 與 `streak` 相同。
畫面欄位：首頁 `#h-streak` = streak.current、`#h-best` = streak.best、`#h-xp` = xp、`#h-level` = `L` + level。

| Fixture | 用途 | status | level | xp | streak current / best / lastDate | game.xp.move / total | game.streaks.life current / best / lastDate |
|---|---|---|---|---|---|---|---|
| `v1-minimal.json` | v1 最小：無 body／profile／band，prs 只有 hrp／plank／run2mi，3 筆 session（含 1 天中斷） | `migrated` | 2 | 35 | 1 / 2 / 2026-08-05 | 35 / 35 | 1 / 2 / 2026-08-05 |
| `v2-real.json` | v2 真實：32 筆 session（full 16、cycle 5、boss 5、rest 3、minimal 2、rain 1；含同日保底→完整版升級）、六種 PR 共 11 筆、body 30 筆（含睡眠誤填 30）、`settings.band:false`、`beep:false`、level 3 | `migrated` | 3 | 361 | 9 / 11 / 2026-09-28 | 361 / 361 | 9 / 11 / 2026-09-28 |
| `v2-missing-fields.json` | v2 缺欄位：缺 level、xp、streak.best、body、profile、prs 的 pushup／pike／sideplank、settings.beep／band | `migrated`（缺少的欄位補預設值不算修補） | 2 | 60（由 sessions 加總） | 3 / 3 / 2026-09-20（best 由 sessions 推導） | 60 / 60 | 3 / 3 / 2026-09-20 |
| `v2-wrong-types.json` | v2 型別錯：`"3"`、`"120"`、`"4"` 等字串數字、非陣列的桶、形狀錯的陣列項目、`profile:"none"`、`settings` 字串布林 | `repaired`（`error.backupKey = daily-ten-state.bak-v2`） | 3 | 120 | 4 / 6 / 2026-09-20 | 120 / 120 | 4 / 4 / 2026-09-20 |
| `empty-arrays.json` | v2 全空（v2 的 DEFAULT_STATE 存檔） | `migrated` | 2 | 0 | 0 / 0 / null | 0 / 0 | 0 / 0 / null |
| `v3.json` | M1 寫出的 v3（v2-real 遷移後又練 3 天；`meta.lastBackupAt = 2026-09-30T21:15:00+09:00`；DJ `createdAt = 2026-09-28T07:30:00+09:00`） | `ok`（遷移是 no-op，內容不變） | 3 | 396 | 12 / 12 / 2026-10-01 | 396 / 396 | 12 / 12 / 2026-10-01 |
| `v3-reverted-to-v2.json` | D12：v3 被舊版 App 改回 `version:2`，舊版又記了 2026-10-02 一次 full；legacy xp／streak 前進，game 沒動（檔內 `game.xp.move = 396`） | `migrated` | 3 | 406 | 13 / 13 / 2026-10-02 | **406 / 406**（不是 396＋406＝802，也不是 396） | 13 / 13 / 2026-10-02 |
| `corrupt-state.txt` | 截斷的 v2 JSON（非 JSON） | `recovered`，`error.code = parse`，`backupKey = daily-ten-state.bak-v2` | 2 | 0 | 0 / 0 / null（改用空白資料） | 0 / 0 | 0 / 0 / null |

`v2-wrong-types.json` 修補後：sessions 剩 6 筆（丟掉字串項目、日期 `2026/09/16`、缺 type 的各 1 筆；`"10"`→10、`null`→0）、`prs.hrp` 2 筆（`"12"`→12，丟掉缺 date 的）、`prs.run2mi`／`prs.pushup` → `[]`、`body.weight` 1 筆、`body.rhr` → `[]`、`body.sleep[0].v` `"7.5"`→7.5、`profile` → `{heightCm:null, age:null}`、`settings` → `{voice:false, beep:true, band:true, …}`。共 20 筆 issue。

### 載入的共同規則
- 主 key **不會**被 `loadState` 覆寫（任何 status）；遷移結果在下次 `saveState()` 才寫入。
- `repaired`／`recovered`：原始字串先存到 `daily-ten-state.bak-v{N}`（N = 原資料的 version；壞 JSON 從字串找 `"version": N`；辨識不出用 2）。該 key 已有**不同**內容 → `daily-ten-state.bak-v{N}-{YYYYMMDDHHmmss}`（同一秒再衝突加 `-2`）；已有**相同**內容（含先前另開的 key）就沿用——重複開 App 不會一直複製。
- 另存失敗（容量不足）：`backupKey = 'daily-ten-state'`（原字串仍在主 key），訊息改為「…原始資料另存失敗，請先下載保存再繼續記錄。」
- 訊息：`repaired` =「部分資料格式異常，已自動修復。原始資料已另存，可下載保存。」；`recovered` =「讀取資料時發生問題，已改用空白資料。原始資料已另存，可下載保存。」
- 其他 recovered：JSON 合法但不是物件（`null`、`[]`、`"字串"`、`42`）→ `error.code = migrate`。`version` 大於 3 → `repaired`（存到 `bak-v4`）。

### B1 早安打卡 fixture（V1）
v3 欄位形狀不變（沒有升版）：`habits.sleep.log[]` 每筆 `{date, lightsOut, wake, lightsOutEdited}`，選填 `wakeEdited`（boolean）與 `target:{bedtime, wakeTime, windowMin}`（打卡當下的目標）；`sessions[].plus`（boolean，加一輪）。`loadState()` 在 `phase.startedAt` 缺少時以載入時間補上（只改記憶體，下次存檔才寫入，已有值不覆寫）。

| Fixture | 內容 | 載入結果 |
|---|---|---|
| `v3-checkin.json` | 從 `v3.json` 接續 10-02～10-04 三天打卡（每筆都有 `target`；10-03 晚上就寢目標改成 23:30，所以前兩筆 23:00、第三筆 23:30，`settings.bedtime` 也是 23:30；10-04 起床往前改成 06:45，`wakeEdited: true`）；10-02 的訓練有 `plus: true`；`startedAt` 2026-10-02T06:50:10+09:00。內容逐字等於重播 B1 寫入流程的結果 | `ok`（遷移不改內容）；xp 411，streak 14 / 14 |
| `v3-checkin-reverted-to-v2.json` | D12：上一個檔案被舊版 App 改回 `version:2`，舊版又做一次保底 | `migrated`；xp 414，`game.xp.move` 414（不是 411＋414）；3 筆打卡與 `plus` 都保留 |
| `v3-bad-sleep.json` | 11 筆壞掉的睡眠項目＋`startedAt: "yesterday"` | `repaired`（存到 `bak-v3`）：修補 9 處、留下 6 筆（10-02、10-04、10-05、10-02、10-10、10-11）；匯入回 9 筆錯誤 |

e2e 可用的時間點：2026-10-04T07:30+09:00（今天已打卡）、2026-10-05T06:50+09:00（今天還沒打卡）。

## 2. 匯入（`parseImport(text)`）

壞檔一律 `{ok:false, errors:[{code, path, message}]}`（最多 10 筆），**`getState()` 與 localStorage 都不變**。

| 檔案 | 結果 | errors（code：path） |
|---|---|---|
| `import-bad-not-json.txt` | ✗ | `not_json`：`''` |
| `import-bad-missing-fields.json` | ✗ | `missing_field`：`streak`、`sessions` |
| `import-bad-wrong-types.json` | ✗ | `invalid_type`：`xp`、`sessions`、`prs.hrp[0].date`、`settings.voice` |
| `import-bad-oversized.json`（超大值） | ✗ | `out_of_range`：`level`、`xp`、`streak.current`、`streak.best`、`prs.hrp[0].reps`、`body.weight[0].v` |
| `corrupt-state.txt` | ✗ | `not_json` |
| 任何 > 5,000,000 字元的文字（測試時現場產生，不放檔案） | ✗ | `too_large` |
| `v2-missing-fields.json` | ✗ | `invalid_type`：`streak.best`（匯入是嚴格驗證，不修補） |
| `v2-wrong-types.json` | ✗ | 20 筆（19 `invalid_type`＋1 `out_of_range`），回傳前 10 筆 |
| `v1-minimal.json`、`v2-real.json`、`empty-arrays.json`、`v3.json`、`v3-reverted-to-v2.json` | ✓ | `incoming` 為 v3（數值同第 1 節） |

訊息範例：「缺少必要欄位：連續天數（streak）」「XP（xp）應為數字」「XP（xp）數值超出合理範圍（應介於 0–10,000,000）」「檔案不是有效的 JSON 格式，可能已損壞或不是 Daily Ten 的備份檔」。

### 好檔的差異摘要（目前 = `v3.json`，匯入 `v2-real.json`）
`summary.rows`（依序；`current` → `incoming`）：版本 `v3` → `v2 → v3`、等級 `L3` → `L3`、XP `396` → `361`、連續天數 `12 天` → `9 天`、最佳連續 `12 天` → `11 天`、最後訓練日 `2026-10-01` → `2026-09-28`、訓練紀錄筆數 `35 筆` → `32 筆`、PR 筆數 `11 筆` → `11 筆`、身體指標筆數 `31 筆` → `30 筆`、睡眠紀錄筆數 `0 筆` → `0 筆`、最後備份 `2026-09-30 21:15` → `從未備份`。

`summary.warnings`：
1. 訓練紀錄會從 35 筆變成 32 筆
2. 身體指標紀錄會從 31 筆變成 30 筆
3. 匯入檔的最後訓練日（2026-09-28）比目前（2026-10-01）舊

反過來（目前 = `v2-real.json`，匯入 `v3.json`）→ `warnings = []`。確認後 `applyImport(incoming)` 才覆蓋並儲存（覆蓋前的資料存到 `daily-ten-state.pre-import`）。

## 3. 備份與提醒（注入時鐘）

- `downloadBackup({now})`：檔名 `daily-ten-backup-YYYY-MM-DD.json`（本地日期）；檔案內容 = 儲存後的 state（`meta.lastBackupAt = isoLocal(now)`，其餘欄位與下載前相同，game 已同步）。分享被取消 → `{ok:false, reason:'cancelled'}`，不寫入。
- `needsBackupReminder(state, now)`（> 7 天才提醒；剛好 7 天不提醒）：

| 載入的 fixture | 2026-10-02 15:30 | 何時開始提醒 |
|---|---|---|
| `v1-minimal`、`v2-real`、`v2-missing-fields`、`v2-wrong-types`（從未備份、有資料） | `true` | 立刻 |
| `v3`、`v3-reverted-to-v2`（lastBackupAt 2026-09-30T21:15:00+09:00） | `false` | 2026-10-07T21:15:00+09:00 仍是 `false`；再過 1 ms 起 `true` |
| `empty-arrays`、`corrupt-state`（沒有任何紀錄） | `false` | 不提醒 |

- `recovered` 後的錯誤卡：`downloadRawBackup(error.backupKey)` 下載 `daily-ten-raw-YYYY-MM-DD.txt`，內容 = 原始字串（`corrupt-state.txt` 原文）。

## 4. 其他檔案
- `harness.html`：`tests/state.browser.spec.js` 用的同源空白頁（在頁面內 `import('/js/state/*.js')`），不是 App 畫面，也不是 fixture。
