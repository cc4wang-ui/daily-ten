# QA 驗收報告 — M1 地基（第 1 輪）

| 項目 | 內容 |
|---|---|
| 受測 | `m1/foundation` @ `3db2ad8`（驗收分支 `m1/wt-qa-checker`，只新增 `tests/e2e/**` 與本報告） |
| 對照基準 | `main` @ `ec87e03`（拆 module 前） |
| 驗收標準 | PLAN.md §2（M1 範圍）、§3（不做）、§4（欄位表）、§5（驗收清單）；CLAUDE.md §2、§5、§9、§11；`tests/fixtures/README.md` 的預期值 |
| 環境 | 2026-10-02，本機 Linux；Playwright 1.56.1／Chromium（headless）；375×667、isMobile、hasTouch、zh-TW、Asia/Tokyo；`CI=1`（2 workers）。**非真機** |
| 指令 | `CI=1 PORT=4471 BASE_PORT=4472 PARITY_BASE_DIR=<scratchpad>/main-ref npx playwright test` |
| 驗收員 | qa-checker（不改產品碼；只寫 `tests/e2e/**`、本報告） |

## Verdict：`PASS`

- 本機 `CI=1` 模式全綠：**266 passed / 0 failed**（既有單元測試 200＋本輪新增 e2e 66）；最終版連跑 2 次結果相同；未設 `PARITY_BASE_DIR` 時 255 passed、11 skipped（等價比對與更新路徑測試正確略過）。
- PLAN.md §5 驗收清單 #1–#10 全部通過；#11 = 本報告。DoD（CLAUDE.md §9）1–7 全部符合（#3 為 N/A，見下）。
- **M1 完成條件「CI 綠燈」：待 Orchestrator 提供 GitHub Actions 結果後補進本報告。** 在那之前，本 Verdict 依本機 `CI=1` 結果。
- 另有 5 項「觀察」（不影響 Verdict，見最後一節），其中「匯入確認鈕快速點兩下會一次套用」建議 Orchestrator 決定是否在 M1 內處理。

## 逐條結果

| # | 項目（qa-checker 清單／PLAN §5） | 結果 | 證據 |
|---|---|---|---|
| 1 | `npm test` 全部（首頁載入、完整訓練流程含保底版） | PASS | 266 passed、exit 0、3.4 分（`full-run-2.log`、`full-run-3.log`）；第 1 次全跑 258 passed（之後再加 8 項）。既有 `tests/state.*` 200 項全過 |
| 2 | 遷移：v1、v2 真實、v2 缺欄位、v2 型別錯、空陣列、v3、被改回 v2、壞 JSON（§5 #1、#2） | PASS | `tests/e2e/migration.spec.js` 11 項。每個 fixture：HOME 的連續天數／最佳／XP／等級＝README 第 1 節；錯誤卡只在 repaired／recovered 出現；提醒卡＝README 第 3 節；**主 key 在存檔前未被覆寫（8 個 fixture 都驗）**；存檔後 v3、`game.xp`／`streaks.train`／`streaks.life` 正確、v3 新欄位齊全；sessions／六種 PR／七種 body（含 `body.sleep`，D13）／profile／settings 原樣保留；不認得的欄位保留；reload 再存一次**逐字相同**；全新 context 再跑一次**逐字相同**。`v3-reverted-to-v2` XP＝406（不是 802、也不是 396），reload＋存檔兩次不變；`v3.json` 存檔後與 fixture 完全相同 |
| 3 | 完整訓練流程：保底版、今日課表、加一輪、雨天、恢復日、Boss Day（HRP／Plank／2 英里）（§5 #4） | PASS | `tests/e2e/training.spec.js` 8 項（假時鐘，跑到完成畫面）。週五保底 +3 → 同日今日課表升級為 full（補差額 +7、連續天數不重複、session 數不變）→ 再跑保底不降級；中途「結束」不寫入；加一輪步驟較多、記 full；週二 full → 隔天週三加一輪記 cycle +15、連續 +1；雨天 21 步 rain +5；週六 rest +5 → 週日 Plank 碼表 1:35 寫入 PR、boss +20、連續 15；HRP 2:00 倒數、空白輸入被擋（alert）、18 下寫入；2 英里缺秒數被擋、18:30＝1110 秒寫入；升級按鈕 → L4、劑量變長。每項都比對畫面、localStorage、`game` 同步 |
| 4 | 匯入壞檔 4 種＋超大值 → 錯誤卡、原資料不變、不白屏（§5 #5） | PASS | `tests/e2e/import.spec.js` 6 項。選檔（file chooser，經「選擇備份檔匯入」按鈕）與貼上兩條路 × 4 種壞檔＋`corrupt-state.txt`、`v2-missing-fields.json`（嚴格驗證擋 `streak.best`）、`v2-wrong-types.json`（只顯示前 10 筆）：`#imp-error` 為 `banner danger`、錯誤數與欄位路徑＝README 第 2 節、**所有 localStorage key 與值逐一比對不變**、預覽不出現、HOME 數值不變。超過 5,000,000 字元（貼上 5,000,001 字元、選檔「合法 JSON＋空白」）→ too_large；剛好 5,000,000 字元不算太大 |
| 5 | 好檔：預覽 → 二次確認 → 套用；取消 | PASS | 同上。v3 → 匯入 v2-real：11 列 `data-key`／目前／匯入後／`data-changed` 與 README 逐字相同、3 條警告相同；第一次按確認只變成「再按一次，確認覆蓋」且 storage 不變，第二次才套用；`pre-import`＝覆蓋前資料；HOME 重繪。9.9 秒仍待確認、滿 10 秒恢復，恢復後要重按兩次；離開 SETUP 再回來預覽收起；取消 → 資料不變 |
| 6 | 備份：檔名、內容＝下載後 state、`lastBackupAt` 含 offset；7 天提醒條件（§5 #6） | PASS | `tests/e2e/backup.spec.js` 14 項。`daily-ten-backup-2026-10-02.json`；內容＝下載後 localStorage（深比對）、縮排 JSON；`2026-10-02T15:30:00+09:00`；LA：`daily-ten-backup-2026-10-01.json`、`2026-10-01T23:30:00-07:00`；Kathmandu：`+05:45`。提醒卡：從未備份＋有資料 → 顯示；6 天、剛好 7 天 → 不顯示；7 天＋1 分、8 天 → 顯示（文字「已經 7／8 天…」）；剛好 7 天再過 1 分鐘切回 HOME → 顯示；空資料／第一次開／壞資料改用空白 → 不顯示；按提醒卡「下載備份」→ 內容正確、卡片立刻消失。**用剛下載的備份檔選檔匯入 → 11 列全部「不變」、無警告 → 兩次確認後資料與備份檔完全相同**。新按鈕沿用 `btn-sub`／`btn-main`，高度 46／59 px（≥ 44） |
| 7 | 載入失敗保護（PLAN §2 #6） | PASS | `tests/e2e/load-failure.spec.js` 9 項。`corrupt-state.txt`：錯誤卡、`bak-v2`＝原字串、主 key 存檔前＝原字串、`#err-download` 下載 `daily-ten-raw-2026-10-02.txt`＝原字串（**主 key 被新資料覆寫後再下載仍是原字串**）、重開不重複另存、跑完保底版後才覆寫主 key、下次開不再出現錯誤卡。`v2-wrong-types`：修補訊息。`null`：recovered。`page.route` 讓 `js/ui/home.js` 404、`setup.js` 執行時丟例外、`body.js` 語法錯誤、`js/state/backup.js` 404 → `#boot-error`、HOME 可見、可下載主 key 原字串（後者走 app.js 內建備援）；沒資料時提示「找不到另存的原始資料」不丟例外；修好後重開資料完整 |
| 8 | 離線：重開後所有畫面可用（§5 #7） | PASS | `tests/e2e/offline.spec.js`：SW 啟用並控制頁面、`caches['daily-ten-v6']`＝`sw.js` 的 30 項 ASSETS（清單從 sw.js 讀）、**線上開 App 實際載入的每個同源檔都在預快取內**；`setOffline(true)`＋攔下所有網路請求 → reload 與「新分頁冷啟動」：四個分頁、BODY 記錄、示範視窗（動畫會動）、保底版跑完；離線期間 0 個請求打到網路、0 個失敗請求。`tests/e2e/upgrade.spec.js`：同網址 main（SW v5）→ M1（SW v6）：第一次重開仍是快取裡的舊版、背景換成 v6 並刪掉 v5，再重開為新版、資料完整（含舊版剛記的一次）、存檔為 v3、離線再開仍是新版 |
| 9 | 拆 module 前後等價（§5 #3） | PASS | `tests/e2e/parity.spec.js` 9 項。8 個情境（週五空資料、週五 v2、週三 v2、週六 v2、週日 v2 2 英里、週日空資料 HRP、週日 v2 Plank、週五被改回 v2 可升級）× 基準（A）／新版（B）／新版再一次（B'）：**每次 119 張截圖＋107 項文字／捲動高度，A/A 0 px、A/B 0 px**。涵蓋 HOME／RECORDS／BODY（逐屏）、SETUP（逐卡，資料備份卡除外；卡內兩版共有的舊控制項比文字）、示範視窗、訓練開始與暫停畫面（今日課表、加一輪、雨天、恢復日、Boss 暖身）、完成畫面、Boss 測驗畫面與輸入畫面、BODY 輸入後、彈力帶開關後、升級後。另 1 項「課表資料與規則等價」：161 組序列（L1–L5 × 有／無彈力帶 × 伸展組／區塊／恢復／保底／一週七天＋雨天）的完整步驟與時長、98 種步驟名稱的示範對應、XP 表、身分句、59 列影片清單、9 天 × 10 種今日計畫文字、160 例升級判定 —— 兩版逐項相同 |
| 10 | 前端掃描：無 API key、無外部請求（YouTube 外連除外）（§5 #8） | PASS | 每個 e2e 測試都自動記錄 context 的全部請求（含 SW）：**只到 127.0.0.1**，且 0 個未捕捉頁面錯誤、0 個 console.error（刻意讓 module 失敗的測試除外）。`tests/e2e/network.spec.js`：走完所有畫面、示範視窗、匯出／匯入、備份、Boss 流程，YouTube 只是 href（影片清單 59 列中 52 列的「真人 ↗」連結、示範視窗連結），不發請求；靜態掃描 App 檔：無 key 樣式、無 AI 端點、外部網址只有 YouTube 搜尋與 SVG 命名空間、網路 API 只有 `sw.js` 的 fetch、動態 import 都是相對路徑。`node .github/scripts/check-repo.mjs` → `check-repo：通過（App 檔 29 個、預快取 30 項、CACHE daily-ten-v6）`，exit 0 |
| 11 | 舊帳號網址 0 次；SW = v6（§5 #9） | PASS | check-repo 通過（上列）。逐檔計數（.git、node_modules 除外）：只出現在 `CLAUDE.md` 1 行、`PLAN.md` 2 行（描述舊網址的說明文字，check-repo 白名單）；README／HANDOFF 為 `https://cc4wang-ui.github.io/daily-ten/`。`sw.js` `CACHE = 'daily-ten-v6'` |
| 12 | 用語表（§5 #10、DoD 5） | PASS | `node tools/jev/check-glossary.js --self-test` → `108/108 通過`、exit 0；`--ci --no-report` → `掃描 23 檔、UI 字串 634 筆：新增違規 0、既有違規 2（不擋）、baseline 未出現 0`、exit 0（CI 已有這一步）。另在 e2e 裡把 M1 新元素實際顯示的文字（錯誤卡、提醒卡、備份狀態、4 種壞檔＋3 個不合格檔＋超過大小的匯入錯誤訊息、預覽列、警告、確認／取消、啟動失敗卡）用同一份 `zh-tw-glossary.json` 檢查：0 違規（括號內資料欄位路徑視為識別字，見觀察 3） |
| 13 | `prefers-reduced-motion` 下無位移動畫 | PASS | `tests/e2e/reduced-motion.spec.js` 4 項：`css/*.css` 沒有任何 transition／animation／@keyframes；reduce 與 no-preference 下叫出全部 M1 新元素（錯誤卡、提醒卡、匯入錯誤、預覽、待確認、啟動失敗卡）→ `document.getAnimations()` 為 0、computed style 無 transition／animation |
| 14 | 遊戲日 03:59／04:01 歸屬日；跨時區 offset | N/A（offset 部分已驗） | 04:00 換日屬 M2a engine（PLAN §3「遊戲規則不做」），M1 程式沒有遊戲日概念（`todayStr()` 仍以本地午夜換日，與 main 相同）。M1 有的時間戳 `lastBackupAt` 已驗 +09:00／-07:00／+05:45 |
| 15 | 階段 P1→P2、P2→P3 邊界 | N/A | M2a／M2b 才有階段轉換；M1 只建 `phase:{current:"P1", startedAt:null, history:[]}`（第 2 項已驗） |

## DoD（CLAUDE.md §9）

| # | 條件 | 結果 | 證據 |
|---|---|---|---|
| 1 | `npm test` 全綠 | PASS（本機 CI=1）／CI 待補 | 最終版 266 passed × 2 次、未設基準 255 passed／11 skipped；GitHub Actions：**待 Orchestrator 提供** |
| 2 | `sw.js` CACHE +1、新檔在預快取 | PASS | v5 → v6；30 項 ASSETS 涵蓋全部 29 個 App 檔＋`./`（check-repo）；離線 e2e 驗快取內容＝ASSETS、開 App 載入的檔都在其中；v5 → v6 更新路徑 e2e |
| 3 | 新／改動作同步 `demos.js` MAP/def 與 VIDEOS | N/A | M1 沒有新增或改名動作：`demos.js` 與 `ec87e03` 位元組相同（sha256 `aa78a8a6…7d07`）；課表資料等價測試證明所有步驟名稱、示範對應、59 列影片清單與 main 相同 |
| 4 | `PROJECT_STATE.md` 決策與踩坑；README 網址 | PASS | PROJECT_STATE：Completed work 有 M1 列、General rules 8／9（SW 預快取、state 只經 `js/state/`）、Lessons learned 有 M1 的匯入寫入 null、D12 改回 v2、預快取漏列、symlink `.gitignore`、截圖雜訊等；M1 驗證紀錄。README／HANDOFF 網址為 `cc4wang-ui.github.io/daily-ten/` |
| 5 | UI 字串通過用語表 | PASS | 第 12 項 |
| 6 | qa-checker PASS | PASS | 本報告 |
| 7 | PR 描述附可勾的「Cross iPhone 真機清單」，只列機器驗不了的 | PASS | `scratchpad/pr-body-m1.md` 有「## Cross iPhone 真機清單」6 條 `- [ ]`：公開網址、更新後舊紀錄、飛航模式、分享選單存到「檔案」、從「檔案」選檔匯入、TTS＋示範動畫 —— 都需要 iPhone／公開網路，機器驗不了。建議（非必要）：第 2 條補一句「第一次開可能仍是舊版，關掉再開」（更新路徑 e2e 證實第一次重開是快取舊版） |

M1 完成條件（CLAUDE.md §8）：舊 v1／v2 fixture 全通過 — PASS；功能與 `main` 等價 — PASS；CI 綠燈 — **待 Orchestrator 提供**。

## 測試清單（本輪新增，`tests/e2e/`）

| 檔案 | 項數 | 內容 |
|---|---:|---|
| `helpers.js` | — | 開 App（假時鐘暫停在指定時間、fixture 只寫入一次）、1 秒一步推進計時器、下載、storage 快照、用語表檢查、**每個測試自動的網路／頁面錯誤守門** |
| `migration.spec.js` | 11 | 第 2 項 |
| `training.spec.js` | 8 | 第 3 項 |
| `import.spec.js` | 6 | 第 4、5 項 |
| `backup.spec.js` | 14 | 第 6 項 |
| `load-failure.spec.js` | 9 | 第 7 項 |
| `offline.spec.js` | 1 | 第 8 項 |
| `upgrade.spec.js` | 2 | 第 8 項（v5 → v6 更新路徑）；D12 用**真的舊版程式**重播：新版存 v3 → 舊版記一次並寫回 version 2（`game.xp.move` 仍 361）→ 新版再開 XP 364、不重複計算。需 `PARITY_BASE_DIR`；自帶伺服器用 port 4477（`QA_UPGRADE_PORT` 可改） |
| `parity.spec.js` | 9 | 第 9 項；需 `PARITY_BASE_DIR` |
| `network.spec.js` | 2 | 第 10 項 |
| `reduced-motion.spec.js` | 4 | 第 13 項 |

## 突變測試（證明這些測試抓得到問題）

在 scratch 複本（不是 worktree）逐一植入缺陷，跑對應的 spec；結果見 `mutation-final.log`（每項都應 exit 1）。

| # | 植入的缺陷 | 抓到的測試 |
|---|---|---|
| M01 | `.mission` 字級 12px → 12.5px | parity（A/B 截圖不同） |
| M02 | `sw.js` 預快取少列 `js/ui/dates.js` | offline（開 App 載入了但沒預快取） |
| M03 | `loadState` 載入時就覆寫主 key | migration（主 key 存檔前應不變） |
| M04 | 匯入第一次按確認就套用 | import |
| M05 | 提醒卡剛好 7 天就提醒（`>` 改 `>=`） | backup |
| M06 | 啟動失敗卡沒插入畫面 | load-failure |
| M07 | D12：`game.xp.move` 累加 legacy xp | migration（reverted） |
| M08 | 同日升級補全額 XP（不是差額） | training |
| M09 | L3 平板支撐 60 → 61 秒 | parity（課表資料等價） |
| M10 | 匯入覆蓋前沒另存 `pre-import` | import |
| M11 | 壞檔時寫入 `null`（舊版 bug 重現） | import（storage 快照不同） |
| M12 | `isoLocal` 時區正負號相反 | backup（LA） |
| M13 | SETUP 一週節奏文字改一個字元 | parity（逐卡截圖） |
| M14 | 錯誤卡下載主 key 而非備份 key | load-failure（第一版測試沒抓到 → 已補「主 key 覆寫後再下載」） |
| M15 | 取消匯入後仍寫入 | import |

## 觀察（不影響 Verdict）

| # | 觀察 | 最小重現 | 建議誰處理（不寫修法） |
|---|---|---|---|
| 1 | **匯入的「確認匯入」快速點兩下（雙擊／連點）會在同一個手勢內套用**，第二次確認形同沒有。覆蓋前資料存在 `daily-ten-state.pre-import`，但沒有 UI 可以還原。PLAN 的「二次確認」字面上已實作（兩次點擊），M1 驗收清單未定義最短間隔，故不判 FAIL | 載入 `v3.json` → SETUP 貼上 `v2-real.json` → 匯入 → 對「確認匯入」雙擊 → `io-msg`＝「匯入成功。」、XP 396 → 361（Playwright `dblclick`；兩次 `tap` 亦同） | Orchestrator 決定是否 M1 處理；若要改：ui-engineer |
| 2 | `reports/copy-glossary.md`（已 commit）內容過期：寫「掃描 3 檔、517 字串」、位置 `index.html:293／:887`；現況為 23 檔、634 字串、`index.html:186`、`js/ui/boss.js:88`。結論相同（新增 0、既有 2）；CI 用 `--no-report` 不會重產 | `node tools/jev/check-glossary.js --report <暫存>` 與已 commit 版比對 | jev-compiler |
| 3 | 匯入錯誤訊息會顯示資料欄位路徑（例：「缺少必要欄位：連續天數（streak）」「連續天數（streak.current）數值超出…」）。CI 的靜態檢查看不到組合後的字串；關鍵字規則 `streak-en` 若不排除括號內識別字會命中。本輪把括號內欄位路徑當識別字排除（README 也把這些訊息列為預期格式），共 16 種路徑 | `import.spec.js` 執行時 log：`[qa] 匯入訊息中的欄位路徑（識別字）…` | Orchestrator 決定是否允許；若要改：data-guardian（`schema.js` 訊息） |
| 4 | PLAN §2 #2 完成條件字面是「repo 內（.git 除外）舊帳號網址 0 次」，實際 `CLAUDE.md`、`PLAN.md` 各有描述舊網址的文字（check-repo 白名單排除）。不是程式問題，條件文字與白名單不一致 | 逐檔計數（第 11 項） | Orchestrator（條件文字） |
| 5 | 示範動畫（`demos.js`，rAF 繪製）不看 `prefers-reduced-motion`。是 main 既有功能、M1 位元組未改，不在 M1 範圍；M3 動畫工作時需處理（CLAUDE.md §2 #9） | 開 SETUP 示範視窗，在 reduce 模式下人偶照常動 | M3：ui-engineer |

## 測試方法備註（給下一輪與 M2a）

- 假時鐘重播時 ticks 會帶入幾毫秒真實時間差 → rAF 影格格點每次不同，`runFor` 視窗內影格數差 1，示範人偶差幾百 px（A/A 就會出現）。解法：掛示範前把 ticks 對齊 16 ms（`alignFrame`）。
- SETUP 逐卡元素截圖：新版資料備份卡較高，後面卡片頁面座標差小數像素 → 一行文字點陣化不同、卡片高度差 1 px。解法：截圖時兩版都讓資料備份卡 `display:none`。
- 長訓練用 `clock.fastForward(1000)` 一秒一步（每次最多觸發一次到期 timer＝計時器節拍），不要用 `runFor` 跑整段（每個 rAF 影格都要等一次真實 setTimeout，30 分鐘課表要好幾分鐘）；這些 spec 關 trace（上千次時鐘呼叫寫進 trace 會慢 4–5 倍）。
- M2a 起畫面會刻意改變：`parity.spec.js`、`upgrade.spec.js` 以 `ec87e03` 為基準，屆時要移除或改基準（PROJECT_STATE 已記）。

## 證據檔案（本機，未 commit）

位於 `/tmp/claude-0/-home-user-daily-ten/9755df85-8ada-5bad-b0f4-c2b277588976/scratchpad/agent-qa-checker/`：

- 全跑紀錄：`full-run-2.log`、`full-run-3.log`（各 266 passed）、`full-run-noparity.log`（255 passed、11 skipped）
- 等價比對截圖（357 張＝119 × A／B／B'）：`shots/<情境>/<A|B|B'>/<名稱>.png`，例：
  - `shots/週五_v2_資料/A/fri-v2-train-paused.png` 與 `shots/週五_v2_資料/B/fri-v2-train-paused.png`（訓練暫停畫面）
  - `shots/週日_空資料_HRP_/B/sun-hrp-empty-boss-test.png`（HRP 測驗倒數）
  - `shots/週日_v2_資料_2_英里_/B/sun-run-v2-boss-input@0.png`（Boss 輸入畫面）
  - `shots/週五_空資料/A/fri-empty-setup-card-3-一週節奏.png`（SETUP 逐卡）
- 突變測試：`mutation-final.log`（第一輪 `mutation-results-round1.txt`：M14 未抓到，補測試後抓到）
- 用語表現況報告：`copy-glossary-now.md`

## Cross iPhone 真機清單（只列機器驗不了的）

- [ ] merge 後 1–2 分鐘，Safari 開 `https://cc4wang-ui.github.io/daily-ten/` 可開啟（本環境 proxy 擋 github.io）
- [ ] 從主畫面開 App：第一次可能仍是舊版，關掉再開後 SETUP 出現「下載備份」；連續天數、XP、PR、BODY 舊紀錄都還在
- [ ] 飛航模式從主畫面開啟：四個分頁、保底版都能用
- [ ] 首頁備份提醒卡 →「下載備份」→ 分享選單「儲存到檔案」成功 → 提醒卡消失
- [ ] SETUP「選擇備份檔匯入」從「檔案」選剛存的檔 → 預覽每列都「不變」→ 按兩次確認 → 數值不變
- [ ] 訓練中語音（TTS）、提示音、示範動畫正常，螢幕不會自動關閉
