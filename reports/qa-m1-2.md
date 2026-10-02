# QA 驗收報告 — M1 地基（第 2 輪）

| 項目 | 內容 |
|---|---|
| 受測 | `m1/foundation` @ `4180f2b`（驗收分支 `m1/wt-qa-checker-2`）＝第 1 輪的樹＋`0e22be6`（e2e 套件，與第 1 輪 commit 內容相同）＋`16b22ae`（重產用語表報告）＋`4180f2b`（匯入確認的連點保護，`js/ui/backup.js` +4 行） |
| 對照基準 | `main` @ `ec87e03` |
| 驗收標準 | 同第 1 輪（PLAN.md §2–§5、CLAUDE.md §2／§5／§9／§11、`tests/fixtures/README.md`），另加本輪的連點保護規格（第一次按後 1,000 ms 內的點擊忽略；滿 1 秒、10 秒內再按才套用；外觀不變） |
| 環境 | 2026-10-02，本機 Linux；Playwright 1.56.1／Chromium（headless）；375×667、isMobile、hasTouch、zh-TW、Asia/Tokyo；`CI=1`（2 workers）。**非真機** |
| 指令 | `CI=1 PORT=4471 BASE_PORT=4472 PARITY_BASE_DIR=<scratchpad>/main-ref npx playwright test` |

## Verdict：`PASS`

- 最終的樹在本機 `CI=1` 全綠：**275 passed／0 failed**（既有單元測試 200＋e2e 75），連跑 2 次結果相同。
- 第 1 輪的觀察 1（快速點兩下「確認匯入」會一次套用）**已修正並驗證**；觀察 2（用語表報告過期）**已重產並驗證**；觀察 3–5 由 Orchestrator 決定保留（見最後一節），不影響判定。
- CI：GitHub Actions 在 `0e22be6`（第 1 輪 e2e 套件）**success**（見「CI 證據」）。`16b22ae`、`4180f2b` 標了 `[skip ci]`，**最終 head 的 CI 結果待 Orchestrator push 後附在 PR**。

## 本輪差異

### 1. 連點保護（4180f2b）— 已驗證
`tests/e2e/import.spec.js` 新增 9 項（假時鐘暫停，點擊間隔只由 `runFor` 決定，是精確值；目前資料 = `v3.json` XP 396、預覽 = `v2-real.json` XP 361）。每一項都比對 **localStorage 全部 key 與值**：沒套用 → 完全不變且仍在預覽中；已套用 → 主 key 換成匯入資料、`pre-import` = 覆蓋前、預覽收起、HOME 更新。

| 測試 | 結果 |
|---|---|
| 雙擊「確認匯入」不套用、停在「再按一次，確認覆蓋」；1.5 秒後再按一下才套用 | PASS |
| 兩次 tap 間隔 200 ms 不套用（再 200 ms 第三下也不套用），文字仍是「再按一次，確認覆蓋」 | PASS |
| 邊界：第一下後 999 ms 的點擊忽略；滿 1,000 ms 套用 | PASS |
| 兩次 tap 間隔 1.5 秒才套用 | PASS |
| 邊界：第一下後 9,999 ms 仍可套用（10 秒時段內） | PASS |
| 間隔超過 10 秒（10.5 秒）：文字恢復「確認匯入（覆蓋目前資料）」、第二下不套用而是重新進入待確認；新的待確認同樣受 1 秒保護，1.5 秒後才套用 | PASS |
| 取消會解除待確認：取消後重選同一檔 → 未確認狀態，要重新按兩次 | PASS |
| 待確認時重新預覽（先換壞檔、再換 `v1-minimal`、再換 `v2-real`）每次都解除待確認；最後套用的是最新預覽（XP 361，不是 v1 的 35） | PASS |
| **真實時鐘**（不裝假時鐘，瀏覽器原生 `performance.now`／計時器）：真的雙擊不套用；真的等 1.2 秒再按才套用（另以 `--repeat-each=3` 連跑 3 次皆過） | PASS |

產品碼檢視：`armedAt` 用 `performance.now()`（單調時鐘，與計時器同源，不受裝置改時間影響）；保護判斷在「已進入待確認」之後，被忽略的點擊不重設時間、不延長 10 秒時段；`resetImport()`（取消、重新預覽、離開 SETUP、匯入完成）會解除待確認。未發現缺陷。

### 2. 第 1 輪 4 個測試失敗的判斷與調整
- **判斷：新行為合理，不是產品缺陷。** 這 4 個測試在暫停的假時鐘下連按兩下（間隔 0 ms），正是第 1 輪觀察 1 指出的「連點直接覆蓋」；連點保護就是要擋這個。真人看完「再按一次，確認覆蓋」再按一下，間隔通常超過 1 秒；就算 1 秒內按了，畫面維持待確認，再按一次即可，資料不會有風險。
- **調整：** `tests/e2e/helpers.js` 新增 `confirmImportTwice(page, gapMs = 1_500)`：第一下 → 斷言進入待確認 → `page.clock.runFor(1_500)` → 第二下。1.5 秒＝模擬真人（大於 1 秒保護、小於 10 秒時段），邊界值改由上表專門測。

| 位置（第 1 輪行號） | 測試 | 改法 |
|---|---|---|
| `backup.spec.js:75` | 下載備份後用該檔匯入（round-trip） | 改用 `confirmImportTwice` |
| `import.spec.js:167` | 選檔匯入 v2-real：第一次確認不套用、第二次才套用 | 第二下前加 `page.clock.runFor(1_500)`（保留中間「第一次按不套用」的斷言） |
| `import.spec.js:203` | 貼上匯入 v3 | 改用 `confirmImportTwice` |
| `import.spec.js:259` | 取消／10 秒恢復後最後真的匯入 | 改用 `confirmImportTwice` |

其餘斷言一字未改；調整後 4 項都過。

### 3. 用語表報告（16b22ae）— 已更新
`node tools/jev/check-glossary.js --report <暫存>` 重新產生的內容與已 commit 的 `reports/copy-glossary.md` **逐字相同**（`diff` 無差異）：掃描 23 檔、UI 字串 634 筆、新增違規 0、既有違規 2（`index.html:186`「時長」、`js/ui/boss.js:88`「數據」）。`js/ui/backup.js` 這次新增的只有註解與數值，沒有新 UI 字串。第 1 輪觀察 2 結案。

## CI 證據（GitHub Actions，workflow「CI」）

以 `gh run view --json`（唯讀）逐一核對，與 Orchestrator 提供的一致：

| Run | Commit | 觸發 | 結果 | 時間（UTC） |
|---|---|---|---|---|
| [37047366994](https://github.com/cc4wang-ui/daily-ten/actions/runs/37047366994) | `0e22be6`（第 1 輪 e2e 套件） | push `m1/foundation` | **success**；13 個步驟全部 success（含「Repo checks」「用語表檢查」「Prepare parity baseline」「Playwright（單元＋e2e）」） | 18:25:52–18:29:26（3 分 34 秒） |
| 37039527949 | `3db2ad8` | push | success | 17:15:52–17:16:46 |
| 37034425147 | `4f8a36a` | push | success | 16:30:41–16:31:22 |
| 37031532286 | `863aab3` | push | success | 16:05:28–16:06:29 |

- 37047366994 的 Playwright 步驟有設 `PARITY_BASE_DIR`（`ec87e03` 的 worktree），所以等價比對與更新路徑測試在 CI 都有跑。
- 本環境的 proxy 擋下 job log 下載（Actions 的 log 儲存回 403），CI 內的測試數字無法取得；測試數字以本機為準。
- **最終 head（含 `16b22ae`、`4180f2b`、本輪 commit）的 CI：待 Orchestrator push 後提供。**

## 逐條結果（沿用第 1 輪，數字更新到本輪）

| # | 項目 | 結果 | 證據 |
|---|---|---|---|
| 1 | `npm test` 全部 | PASS | 275 passed、exit 0、約 3.2 分 × 2 次（`r2/full-run-r2-1.log`、`r2/full-run-r2-2.log`） |
| 2 | 遷移（PLAN §5 #1、#2） | PASS | `migration.spec.js` 11 項（同第 1 輪：8 個 fixture 的 HOME 數值、錯誤卡、提醒卡、主 key 存檔前不變、v3 欄位、舊資料原樣保留、reload 與全新 context 逐字相同、被改回 v2 的 XP＝406） |
| 3 | 完整訓練流程（§5 #4） | PASS | `training.spec.js` 8 項（保底、今日課表、加一輪、雨天、恢復日、Boss HRP／Plank／2 英里、同日升級、升級按鈕） |
| 4 | 匯入壞檔 4 種＋超大值（§5 #5） | PASS | `import.spec.js`：兩條路 × 7 個不合格檔＋too_large，所有 localStorage key 與值不變、不白屏 |
| 5 | 好檔：預覽 → 二次確認 → 套用；取消；**連點保護** | PASS | `import.spec.js` 共 15 項（第 1 輪 6 項＋本輪 9 項，見「本輪差異 1、2」） |
| 6 | 備份與 7 天提醒（§5 #6） | PASS | `backup.spec.js` 14 項（檔名、內容＝下載後 state、+09:00／-07:00／+05:45、6 天／剛好 7 天不提醒、7 天＋1 分／8 天提醒、下載後提醒卡消失、下載檔再匯入完全相同、觸控 ≥ 44px） |
| 7 | 載入失敗保護 | PASS | `load-failure.spec.js` 9 項 |
| 8 | 離線重開（§5 #7） | PASS | `offline.spec.js` 1 項＋`upgrade.spec.js` 2 項（SW v5 → v6 更新路徑、D12 真實舊版程式重播） |
| 9 | 拆 module 前後等價（§5 #3） | PASS | `parity.spec.js` 9 項：8 情境 × 每次 119 張截圖＋107 項文字／高度，A/A 0 px、A/B 0 px；課表資料與規則逐項相同（161 組序列、98 種步驟、59 列影片、160 例升級判定、9 天 × 10 種今日計畫） |
| 10 | 前端掃描、無外部請求（§5 #8） | PASS | 每個 e2e 測試的網路守門（只到 127.0.0.1、0 個頁面錯誤）＋`network.spec.js` 2 項；`check-repo：通過（App 檔 29 個、預快取 30 項、CACHE daily-ten-v6）` exit 0 |
| 11 | 舊帳號網址 0 次；SW = v6（§5 #9） | PASS | check-repo 通過；`CLAUDE.md`、`PLAN.md` 的說明文字依 PR #0 指示白名單保留（Orchestrator 決定） |
| 12 | 用語表（§5 #10、DoD 5） | PASS | `--self-test` → `108/108 通過` exit 0；`--ci --no-report` → `掃描 23 檔、UI 字串 634 筆：新增違規 0、既有違規 2（不擋）、baseline 未出現 0` exit 0；e2e 內 M1 畫面文字 0 違規 |
| 13 | `prefers-reduced-motion` | PASS | `reduced-motion.spec.js` 4 項 |
| 14 | 遊戲日 04:00 邊界 | N/A | M2a 才有遊戲日；時間戳 offset 已驗 |
| 15 | 階段 P1→P2→P3 | N/A | M2a／M2b |

## DoD（CLAUDE.md §9）

| # | 條件 | 結果 | 證據 |
|---|---|---|---|
| 1 | `npm test` 全綠 | PASS | 本機最終樹 275 passed × 2；CI 在 `0e22be6` success；最終 head 待 Orchestrator |
| 2 | `sw.js` CACHE +1、新檔在預快取 | PASS | v6；本輪沒有新增檔案（只改 `js/ui/backup.js`，已在預快取清單） |
| 3 | 新／改動作同步 `demos.js` 與 VIDEOS | N/A | 沒有新增或改名動作（課表資料等價測試通過） |
| 4 | `PROJECT_STATE.md`、README | PASS | 同第 1 輪；本輪無文件變更需求 |
| 5 | 用語表 | PASS | 第 12 項 |
| 6 | qa-checker PASS | PASS | 本報告 |
| 7 | PR「Cross iPhone 真機清單」可勾、只列機器驗不了的 | PASS | `pr-body-m1.md` 6 條 `- [ ]` 都需要 iPhone／公開網路；第 2 條已加「第一次可能仍是舊版（快取），完全關掉再開一次」。建議（非必要）：第 5 條寫成「看到『再按一次，確認覆蓋』後再按一次」——1 秒內的第二下會被安靜忽略，Cross 連點可能以為沒反應 |

## 突變測試（最終的樹，scratch 複本）

22 個植入缺陷全部被抓到（`r2/mutation-r2-part1.log`：M01–M14；`r2/mutation-r2-part2.log`：M15、G1–G7）。M01–M15 同第 1 輪；本輪新增連點保護的 7 個：

| # | 植入的缺陷 | 抓到的測試 |
|---|---|---|
| G1 | 關掉保護（`GUARD_MS = 0`） | 雙擊不套用 |
| G2 | 邊界 `<` 改 `<=` | 999／1,000 ms 邊界 |
| G3 | 保護改成 1.5 秒 | 999／1,000 ms 邊界 |
| G4 | 進入待確認時沒記下時間 | 連點保護整組 |
| G5 | 重新進入待確認時沒重設時間 | 超過 10 秒 |
| G6 | 取消／重新預覽沒解除待確認 | 取消、重新預覽 |
| G7 | 待確認時段 10 秒改 30 秒 | 超過 10 秒 |

## 第 1 輪觀察的處理

| # | 觀察 | 處理 |
|---|---|---|
| 1 | 快速點兩下「確認匯入」一次套用 | **已修正**（4180f2b），本輪 9 項測試＋7 個突變驗證 |
| 2 | `reports/copy-glossary.md` 過期 | **已重產**（16b22ae），與現況逐字相同 |
| 3 | 匯入錯誤訊息顯示資料欄位路徑（例：「連續天數（streak）」） | Orchestrator 決定：**保留** |
| 4 | 舊帳號網址只出現在 `CLAUDE.md`、`PLAN.md` 的說明文字 | Orchestrator 決定：**依 PR #0 指示保留白名單** |
| 5 | 示範動畫不看 `prefers-reduced-motion` | Orchestrator 決定：**M3 處理** |

本輪沒有新的觀察。

## 證據檔案（本機，未 commit）

位於 `/tmp/claude-0/-home-user-daily-ten/9755df85-8ada-5bad-b0f4-c2b277588976/scratchpad/agent-qa-checker/r2/`：

- 全跑紀錄：`full-run-r2-1.log`、`full-run-r2-2.log`（各 275 passed）
- 等價比對截圖：`shots/<情境>/<A|B|B'>/<名稱>.png`（357 張）
- 突變測試：`mutation-r2-part1.log`、`mutation-r2-part2.log`
- 用語表：`copy-glossary-now.md`（與已 commit 版逐字相同）、`glossary-selftest.log`
- 第 1 輪證據仍在上一層目錄（`full-run-2.log`、`full-run-3.log`、`shots/`、`mutation-final.log`）

## Cross iPhone 真機清單（只列機器驗不了的）

- [ ] merge 後 1–2 分鐘，Safari 開 `https://cc4wang-ui.github.io/daily-ten/` 可開啟
- [ ] 從主畫面開 App：第一次可能仍是舊版（快取），完全關掉再開一次 → SETUP 出現「下載備份」，連續天數、XP、PR、BODY 舊紀錄都還在
- [ ] 飛航模式從主畫面開啟：四個分頁、保底版都能用
- [ ] 首頁備份提醒卡 →「下載備份」→ 分享選單「儲存到檔案」成功 → 提醒卡消失
- [ ] SETUP「選擇備份檔匯入」從「檔案」選剛存的檔 → 預覽每列都「不變」→ 按「確認匯入」，看到「再按一次，確認覆蓋」後再按一次 → 數值不變
- [ ] 訓練中語音（TTS）、提示音、示範動畫正常，螢幕不會自動關閉
