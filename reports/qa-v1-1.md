# QA 驗收報告 — V1 亮色外觀＋三環＋早安打卡（第 1 輪）

| 項目 | 內容 |
|---|---|
| 受測 | `v-next/b1` @ `bc31834`（驗收分支 `b1/wt-qa`，產品碼、單元測試、fixture、文件都沒改；只改 `tests/e2e/**` 與本報告）。對 `origin/main`（`efa688c`，SW v8，目前線上）：G `data/game.json`、`js/game/**`、`js/habits/**`；D `js/state/habits.js` 等；UI `index.html`、`css/**`、`js/ui/**`、`js/app.js`（亮色、分頁今日／訓練／統計＋右上設定、三環、早安打卡、part 2）；Orchestrator `sw.js`（v9）、`manifest.webmanifest` |
| 基準 | 等價比對 `ec87e03`（SW v5，`PARITY_BASE_DIR`）；更新路徑 `ec87e03`（v5）與 `origin/main` `efa688c`（v8，`UPGRADE_BASE_DIR`） |
| 驗收標準 | Orchestrator 的 V1 brief（Phase A 1–5、Phase B 1–20）；CLAUDE.md §2、§7、§8 V1 列、§9 DoD、§11；B1 契約；qa-checker 固定清單 1–10 |
| 環境 | 2026-10-05，本機 Linux（4 核）；Playwright 1.56.1／Chromium headless；375×667、isMobile、hasTouch、zh-TW、Asia/Tokyo（另有 America/Los_Angeles、Asia/Kathmandu）；預設 2 workers（同 CI）。**非真機** |
| 指令 | `QA_UPGRADE_PORT=4710 PORT=4620 PARITY_BASE_DIR=<scratchpad>/main-ref UPGRADE_BASE_DIR=<scratchpad>/wt/gap npx playwright test`（`QA_UPGRADE_PORT` 只換切換式伺服器的 port，避開同機其他 agent 的預設 4477）；另跑 `node .github/scripts/check-repo.mjs`、`node tools/jev/check-glossary.js --ci --no-report` |

證據檔在 `<scratchpad>/qa-b1/`（`<scratchpad>` = `/tmp/claude-0/-home-user-daily-ten/9755df85-8ada-5bad-b0f4-c2b277588976/scratchpad`），下文用相對路徑。e2e 檔名簡稱：`T`＝`v1-today`、`C`＝`v1-checkin`、`P`＝`v1-places`、`A`＝`v1-a11y`（都在 `tests/e2e/`）。

## Verdict：`FAIL`（1 項產品缺陷）

- 最終的樹全套 739 項：**738 passed／1 failed**（單元 504＋e2e 235，5.7 分，exit 1；`full-run-2.txt`）。唯一的失敗是產品缺陷 **BUG-1**：匯入預覽仍顯示舊尺度的 XP（brief Phase B 15「畫面上看不到第二種 XP」；ui-engineer 在 `js/ui/stats.js` 也寫明「全 App 只有新尺度一種 XP」）。其餘全部通過。
- 第一次全套（`full-run-1.txt`，6.1 分）736 項 734／2：1 項是 BUG-1，另 1 項是我在執行中途改了該測試的標題（0 ms、找不到測試），之後補了 3 項（P1→P2 邊界 2、洛杉磯打卡 1），所以再跑一次最終全套。
- `check-repo` 通過（App 檔 47、預快取 48 項、CACHE v9 > main v8）；用語表 0 新增、0 既有違規（掃 41 檔、939 筆 UI 字串）。
- 植入 13 個缺陷（只改暫存副本），**13 個全部被抓到**（見「植入缺陷」）。
- 修好 BUG-1 後，只要重跑 `T` 的「匯入預覽」一項＋全套；本輪其他項目不受影響。
- 本輪過程中有一次干擾要說明：我在 23:21 左右用 `pkill -f "playwright test"` 停自己的測試，**同時停掉了 ui-engineer 剛開始的一次 Playwright 執行**（`wt/b1-ui`，port 4631，起跑約 19 秒），並清掉它留下的伺服器行程。之後只用自己的 PID 停行程。ui-engineer 那次結果不能採信，需要重跑（他之後已重開一次）。

## qa-checker 固定清單（V1 範圍）

| # | 項目 | 結果 | 證據 |
|---|---|---|---|
| 1 | `npm test` 全部：首頁、完整訓練流程（含保底版）、V1 早安打卡、三環、舊功能 | FAIL（1 項＝BUG-1） | 739 項 738 passed／1 failed（`full-run-2.txt`）。訓練流程 `training.spec.js` 8/8（保底版、同日升級、+0、加一輪、雨天、恢復日、Boss 三項、強度升級）；早安打卡 `C` 20/20；今日 `T` 13/14（1 項＝BUG-1）；舊功能 `P` 9/9 |
| 2 | 遷移：v1、v2、v3、被改回 v2（含 B1 打卡 fixture）載入正常、XP 與 streak 正確、跑兩次相同 | PASS | `migration.spec.js` 13/13：README 表 8 個 fixture 各在兩個全新 context 各跑一次，存檔內容逐字相同；V1 載入補上的 `phase.startedAt`＝假時鐘 NOW（8 處斷言更新）；新增 `v3-checkin`／`v3-checkin-reverted-to-v2`：3 筆打卡日期不重複、`plus:true` 保留、`game.xp.move` 414（不是 411＋414）、三環的眠與圖例＝engine 分數、兩次執行逐字相同 |
| 3 | 匯入壞檔（非 JSON、缺欄位、型別錯、超大值、>5,000,000 字元）→ 錯誤卡、不白屏、不覆蓋 | PASS | `import.spec.js` 15/15（選檔＋貼上兩條路、所有 key 與值不變）；`relocate.spec.js` 新網址選壞檔；`pre-import` 備份＝覆蓋前記憶體內容（含載入時補上的起點） |
| 4 | 離線：SW 開著、第一次載入後斷網冷啟動，所有畫面可用 | PASS | `offline.spec.js` 2/2：開機實際載入的每個同源檔都在預快取；斷網 reload 與新分頁冷啟動，`data/game.json`、`js/game/*`、`js/habits/*`、`js/state/habits.js`、`js/ui/checkin.js`、`rings.js`、`toast.js` 都由 SW 回應；三環在、07:00 早安打卡寫入成功、復原也可以；各分頁、示範視窗、保底版可用；沒有請求打到網路 |
| 5 | 遊戲日：03:59／04:00／04:01 歸屬日；跨時區 offset | PASS | `C`「打卡時段」：03:30、03:59 關閉（遊戲日＝前一天，下一步＝engine 算的 Boss Day）、04:00、04:01、11:59 開放、12:00、12:30 關閉；`T`「遊戲日」：週二 01:58 開始、02:00 後練完 → `date:'2026-10-05'`、今日顯示「週一 10/5」與週一課表，04:00 起換週二；週一 01:00 Boss Day → PR 與紀錄 `2026-10-04`；`C`「跨時區」：洛杉磯 03:59 仍是前一天、07:00 打卡 → `-07:00`；`backup.spec.js` LA／加德滿都 offset；engine 單元測試 `game.day.spec.js` 14 項 |
| 6 | 階段 P1→P2 邊界（剛好達標／差 1） | PASS | `T`「P1→P2 邊界」：近 14 天在時段內 9 天 →「解鎖 9/10」、10 天 →「下一版開放」＋打卡畫面「條件達成，探索下一版開放」，階段仍 P1、探環鎖定（探索本版未開放，D16）；P2→P3 不在 V1 範圍。engine 單元測試另有 9／10 天、near 不算、分散 19 天、達成後不倒退 |
| 7 | `prefers-reduced-motion` 下無位移動畫 | PASS | `reduced-motion.spec.js` 6/6（重寫）：CSS `@keyframes` 只動 transform／opacity、沒有 transition、`Element.animate` 只在 `update.js`（opacity）；reduce 時 toast 與三環的動畫只有 `fade-in`（只有 opacity、`transform` 計算值 none）；no-preference 時 `ring-sweep`、`toast-in` 只動 transform／opacity；`#train` 蓋上來時兩個動畫都 `paused`，結束後恢復；M1 資料保護元素、啟動失敗卡仍無動畫；`auto-update.spec.js` 的「已更新」提示 reduce 不播 |
| 8 | 前端碼掃描：無 API key、無外部請求（YouTube 除外） | PASS | `network.spec.js` 2/2：走過所有分頁＋早安打卡＋Boss，所有請求只到 127.0.0.1；靜態掃描改成遞迴（含新的 `js/game`、`js/habits`、`data/*.json`，原本只掃 `js/ui`、`js/state` 會漏），網路 API 只准 `sw.js` 的 fetch 與 `js/game/rules.js` 的 `fetch(RULES_URL)`（RULES_URL＝同源 `../../data/game.json`）；`check-repo` 通過 |
| 9 | 用語表：新增字串 0 違規 | PASS | `check-glossary --ci`：新增 0、既有 0；`A` 每個畫面（今日 打卡前／後、早安打卡 3 種狀態、訓練、統計兩段、設定含匯入錯誤與預覽、錯誤卡）看得到的字串全部過 `expectGlossaryClean` |
| 10 | DoD（§9）逐條 | 見下表 | — |

## brief Phase A（既有測試對齊 V1，沒有放寬）

| # | 項目 | 結果 | 證據 |
|---|---|---|---|
| A1 | helpers：`gotoTab`、`waitReady`、`expectHome` | PASS | `gotoTab`：設定走今日 `#h-settings`、訓練紀錄／身體指標走統計的兩段、早安打卡走圖例「眠」；`waitReady`＝`html[data-ready="1"]`；舊版頁面另有 `waitReadyM1`／`expectHomeM1`／`gotoTabM1`（upgrade、relocate 的 v5／v8 頁面）。`expectHome` 保留原意：① App 載入後的 level／xp／streak.current／best＝README 表（讀 App 的 state）② 畫面：`#h-level`＝`L`＋level、`#h-streak`＝engine 連續天數、`#h-xp`／`#h-best`＝engine 累計 XP／最佳連續（engine 在頁面內直接 import、rules 直接讀 `data/game.json`，不經 UI 轉接層） |
| A2 | 等價比對：保留課表規則＋訓練畫面家族逐像素；畫面層退役 | PASS | `parity.spec.js` 10/10：訓練畫面家族 7 情境 A/A 0、A/B 0（train-start、train-paused、boss-test、demo-modal、demo-modal-2）；課表規則等價（161 組序列、98 種步驟、影片 59 列、升級 160 例、今日計畫 9 天）；新增「統計／身體指標計算結果與今日課表時長＝基準」「基準靜態 markup 的 78 個 id 新版都在（缺 0）」。退役清單見下 |
| A3 | reduced-motion 重寫 | PASS | 同固定清單 7 |
| A4 | 自動更新、升級：新選擇器，D23 保證不變；新增 toast／修改時間列不重新載入 | PASS | `auto-update.spec.js` 22/22（新增 2）：打卡後 10 秒內（toast＋復原顯示中）真實等 4 秒＋假時鐘 6 秒都不重新載入，滿 10 秒 toast 收起後 2 秒內重新載入、打卡紀錄逐字保留；「修改時間」列開著不重新載入、按「恢復預設」收起才重新載入、沒有寫入。`upgrade.spec.js` 3/3：v5 → 目前 5.9 秒、v8 → 目前 3.9 秒自動換新版、只導向一次、資料逐字相同、離線仍是新版（三環在） |
| A5 | 搬家：新網址匯入卡的「選擇備份檔」同一個點擊就到設定 | PASS | `relocate.spec.js` 47/47：新增同步檢查——在頁面內同步派發點擊，handler 回來的那一刻 `#s-setup` 已 active、`#imp-file.click()` 在同一個同步流程被呼叫（`sync:true`，呼叫當下設定已 active）；真點擊打開 filechooser；D24 其他保證全部保留（卡片位置改成「頁首（日期）之後第一張」、設定時分頁列亮「今日」） |

## brief Phase B（新測試）

| # | 項目 | 結果 | 證據 |
|---|---|---|---|
| B1 | 全新 07:00：日期、P1 第 1 天、連續天數、身分宣言、三環；探＝虛線鎖定＋解鎖 0/10；下一步＝打卡；不寫入 | PASS | `T`「今日：全新資料」：「週一 10/5」「P1 睡飽 · 第 1 天」、連續 0 天、身分宣言（粗體段落）、動／眠實線軌道＋探虛線鎖定環與鎖頭、中央「Lv1」「0 / 200 XP」、aria-label 全文、圖例「解鎖 0/10」（＝engine `unlock.short`）、`data-kind=checkin`、localStorage 仍是 `{}` |
| B2 | 打卡寫入剛好 1 筆、toast、+30／+20／+10、60／60、下一步＝課表；10 秒內復原、滿 10 秒消失；同日第二次被擋 | PASS | `C`：紀錄＝`{date:'2026-10-05', lightsOut:'2026-10-04T23:00:00+09:00', wake:'2026-10-05T07:00:00+09:00', lightsOutEdited:false, target:{bedtime:'23:00', wakeTime:'07:00', windowMin:30}}`（＝brief 字面值＝Node engine）；toast「已記錄起床 07:00 · +60」＋「復原」；圖例與 aria-label 60／60；9 秒按復原 → 紀錄刪除、回待打卡；9.999 秒仍在、10 秒收起；同一工作連按兩下、已打卡後再觸發、重開都只有 1 筆 |
| B3 | 改熄燈 00:40 → `lightsOutEdited:true`、D18 漸進＝engine | PASS | `C`：熄燈 base 5、時數 6h20m base 0、合計 35；畫面每一行＝engine |
| B4 | 03:30、12:30 顯示 `#ci-closed`＋engine 原因、不寫入；時段 04:00–12:00 | PASS | `C`：「早安打卡 04:00 開放」「早安打卡開放到 12:00，明天早上見」；收起的按鈕被程式觸發也不寫；停在畫面跨過 12:00 才按 → `#ci-msg` 顯示原因、不寫入 |
| B5 | 計分表 ≥3 例＝`buildCheckIn` | PASS | `C` 5 例（60／45／15／35／40），三種狀態 full／near／base 在起床、熄燈、時數都出現 |
| B6 | 下一步：打卡 → 課表 → 週日 Boss → 完成 | PASS | `C`：打卡→今日課表→練完「今天都完成了」；週日打卡後 Boss、下午沒打卡也 Boss |
| B7 | fixture：10-04 07:30 已打卡、10-05 06:50 未打卡、被改回 v2 不重複 | PASS | `C`＋`migration.spec.js`：明細＝engine 對存檔紀錄、預填 23:30、寫入第 4 筆；改回 v2 的檔 3 筆不重複、環正確 |
| B8 | 規則檔 404／不是 JSON：不白屏、無未捕捉錯誤、遊戲卡片隱藏、下一步退回課表、訓練照常 | PASS | `T` 3 例（404、壞 JSON、形狀不對）：沒有 `#boot-error`、三環／階段／打卡入口隱藏、`data-kind=workout`、統計用舊欄位、保底版記錄 `+3 XP　·　連續 1 天`、打卡紀錄原樣保留；壞 JSON 與形狀不對時 console.error 也是 0。`load-failure.spec.js` 另加 engine／sleep／habits／day 模組 404 四例 |
| B9 | 舊功能在新位置 | PASS | `P` 9/9：訓練分頁（今日課表、加一輪、保底版、雨天、週日 Boss、一週節奏標今天、彈力帶、示範動畫會動、59 個真人連結全是 YouTube＋新分頁＋noopener）；統計（56 格＝每天種類、PR 最近 5 筆、BODY 存檔）；設定（3 開關存檔、彈力帶改課表、就寢／起床、下載、匯入、版本行最後且不在卡片內） |
| B10 | 離線冷啟動含規則檔與新 module、打卡可用 | PASS | 同固定清單 4 |
| B11 | 對比 ≥4.5:1（大字 3:1）、目標 ≥44×44 | PASS | `A`：12 個畫面狀態共 708 個文字節點／230 個目標，**0 不合格**（摘要表印在 log）。植入缺陷 m9／m10 證明稽核會抓 |
| B12 | 用語表 | PASS | 同固定清單 9 |
| B13 | 遊戲日 02:00 → 前一天 | PASS | 同固定清單 5 |
| B14 | 加一輪：當天 type＋`plus:true`、engine 動 60、legacy xp 是數字 | PASS | `training.spec.js`：週五 `{type:'full', xp:10, plus:true}`、週三 `{type:'cycle', xp:15, plus:true}`，沒有 type `'plus'`，engine 當天動 60（tier plus） |
| B15 | `#h-xp`＝engine total、`#h-best`＝engine best；看不到第二種 XP | **FAIL** | 統計三例（v2-real、v3、v3-checkin）PASS，主畫面七個都沒有舊尺度 XP；**匯入預覽仍顯示舊尺度 XP → BUG-1** |
| B16 | 完成畫面「+N XP　·　連續 N 天」 | PASS | `training.spec.js` 每段：N＝規則推得的增加量＝記錄前後 engine 累計 XP 的差（保底 30、補到主課表 +20、再跑保底 +0、加一輪 60、Boss 60），連續天數＝engine；沒有 STREAK、沒有「數據不說謊」；Boss 身分句「測驗完成，成績已記錄。」 |
| B17 | 修改起床：往前 → `wakeEdited:true`；晚於按下 → engine 原因、不寫入 | PASS | `C`：「今天起床」label、說明文字、「恢復預設」；07:30 →「起床時間不能晚於現在」、欄位改回 07:00、localStorage 仍 `{}`；06:30 → `wakeEdited:true`、分數＝engine |
| B18 | AFT 卡用歷來最佳 | PASS | `T`：最佳≠最近一次的資料 →「已達自選目標」「差 10 秒」「差 1:03」＝engine `aftGaps`；說明「以歷來最佳成績計算。」；沒有紀錄 →「尚無紀錄」 |
| B19 | 匯入後補 `phase.startedAt`；設定不存空白時間 | PASS | `import.spec.js`、`T`：匯入 v2-real 後起點＝匯入當下（07:00:01）、今日「第 1 天」、下次存檔寫入；`P`：清空就寢／起床 → 改回、「時間格式不對，沒有變更。」、不寫入 |
| B20 | 分頁列不透明、最後一張卡片捲得到分頁列上方 | PASS | `A`：底色 alpha 1、沒有 backdrop-filter；今日、訓練、統計兩段、設定、早安打卡捲到底，最後區塊的底 ≤ 分頁列頂，分頁列在最上層 |

## Definition of Done（CLAUDE.md §9）

| # | 項目 | 結果 | 證據 |
|---|---|---|---|
| 1 | `npm test` 全綠 | **FAIL** | 唯一失敗＝BUG-1（`T`「匯入預覽：不顯示舊尺度的 XP」） |
| 2 | `sw.js` CACHE +1、新檔在預快取 | PASS | v9（main v8）；check-repo「預快取 48 項」；`offline.spec.js` 開機載入的檔全部在預快取 |
| 3 | 新／改動作同步 `demos.js` 與 `VIDEOS` | PASS（本版沒有新動作） | `demos.js` 與 `efa688c` 相同；課表規則等價（示範 key、影片清單逐項相同） |
| 4 | `PROJECT_STATE.md` 更新決策與踩坑；README 網址 | 部分（待 Orchestrator） | README 正式網址正確；PROJECT_STATE 已記 D26 與 V1 開工，V1 的 G／D 拍板與本輪踩坑（見「觀察」）待 PR 時補 |
| 5 | UI 字串過用語表 | PASS | 同固定清單 9 |
| 6 | qa-checker PASS | **FAIL** | 本報告 |
| 7 | PR 描述附 Cross 真機清單 | 待 Orchestrator | 清單見文末（3 條） |

## V1 完成條件（CLAUDE.md §8）

| 條件 | 結果 | 證據 |
|---|---|---|
| engine 單元測試覆蓋本版規則 | PASS | `tests/game.*` 144 項（遊戲日 14、engine 59、規則 38、眠 33）：04:00 換日與時區、動分級、XP 推導、等級曲線、train／life 連續天數、階段與起點、P1→P2（9／10 天、near 不算、不倒退）、探索閘門、下一步、AFT、壞資料 fuzz；全部通過 |
| e2e：打卡／復原／三環／舊功能 | PASS | `C`、`T`、`P`、`A` 新增 47 項 |
| CI 綠燈 | **未達** | BUG-1；另外本分支 commit 都是 `[skip ci]`、QA commit 依指示不 push |

## 退役的測試（理由）

全部在 `parity.spec.js`（只在設了 `PARITY_BASE_DIR` 時跑）。V1（D26）刻意改了今日、統計、設定與 Boss 成績輸入、完成畫面，這些畫面不可能再和 ec87e03 逐像素相同。

| 退役 | 理由 | 行為改由誰守 |
|---|---|---|
| 各情境的 HOME 逐屏截圖＋文字（`*-home`、`*-home-after`、`fri-v2-home-band`、`wed-v2-home`、`sat-v2-home`、`sun-*-home`） | 今日改版（亮色、三環、下一步） | `T`（日期、階段、三環、下一步）、`training.spec.js`（下一步文字與分鐘、保底版分鐘、中斷提示改中性）、parity 新增「今日課表時長＝基準」 |
| RECORDS、BODY 逐屏截圖＋文字（`*-records`、`*-records-after`、`*-body`、`fri-v2-body-after`） | 搬進統計兩段、亮色 | parity 新增「統計／身體指標計算結果＝基準」（熱力圖每格種類、PR 清單、BODY 判讀／指標卡／營養目標／圍度／肌力逐字相同）；`P` 統計 |
| SETUP 逐卡截圖（`*-setup-card-*`、`fri-v2-setup-band`、`wed-v2-setup`、`fri-rev-setup-L4`） | 設定重組（動作庫、一週節奏、彈力帶搬到訓練分頁；新增睡眠時間卡） | `P`「設定擁有全部控制項、卡片順序、版本行最後」「開關存檔、彈力帶改課表」；parity 新增「基準的 78 個 id 都在」 |
| Boss 成績輸入（`*-boss-input`） | 換亮色、標題改「2 英里跑 成績輸入」 | `training.spec.js` 三項 Boss（標題、空白被擋、PR 寫入） |
| 完成畫面（`*-done`、`*-boss-done`） | 文字改「+N XP　·　連續 N 天」、Boss 身分句改中性 | `training.spec.js` 每段完成畫面 |
| 整個情境「週五 v3 被改回 v2（今日已完成、可升級）」 | 只剩今日／設定／統計畫面 | `training.spec.js`「強度升級」（按鈕文字、alert、L4、劑量變長） |
| 「SETUP 結構：新版＝基準的子元素＋版本行」 | 設定子元素刻意不同 | `P` 設定結構、parity「id 都在」 |

另外兩處改法（不是退役，寫明以免誤會）：
- 動作示範視窗：遮罩 92% 不透明，背後畫面（刻意改成亮色）會透出 8%；改成只比示範視窗內部（`.box` 四邊各內縮 12px 的 clip，內容全在範圍內），另比動作名稱與提示文字。內縮前的 527px 差異全在圓角與小數像素邊緣（`pxdiff.mjs` 分析：上緣 276、四角 78／77／48／48）。
- 舊版 reduced-motion 測試「CSS 檔沒有 transition／animation／@keyframes」：V1 依設計加了三環與 toast 動畫，改成白名單（只准 transform／opacity）＋執行期檢查。

## 產品缺陷

### BUG-1　匯入預覽顯示舊尺度的 XP（畫面上出現第二種 XP）

- 位置：`js/state/backup.js:221-223`（`summary.rows` 的 `level`、`xp`、`streak` 取舊欄位 `s.level`、`s.xp`、`s.streak.current`），由 `js/ui/backup.js:114` 畫成 `#imp-rows`。
- 最小重現：`v3.json`、2026-10-02 15:30 → 統計「累計 XP」1760 → 設定 → 貼上 `v2-real.json` → 按「匯入（覆蓋現有資料）」→ 預覽「XP　396　361」（engine 累計 XP 應為 1760 → 1610）。
- 同一張預覽的相關不一致（同一處修）：「連續天數 12 天 → 9 天」是舊欄位（今日顯示 engine 連續天數，v2-real 在 10-02 是 0）；「等級 L3」其實是課表強度，與今日中央「Lv 6」同名，違反契約「遊戲等級寫 Lv N、課表強度寫強度 L2，不要同名」。
- 測試：`T`「匯入預覽：不顯示舊尺度的 XP（有 XP 列時＝engine 對目前／匯入後資料算的累計 XP）」——拿掉 XP 列或改成 engine 值都會通過。
- 建議：data-guardian（`summary.rows` 與 `tests/state.backup.spec.js` 的預期表）；若要顯示 engine 值，與 ui-engineer 協調（state 模組不直接 import engine）。

沒有發現其他產品缺陷。

## 測試修正（測試端，不是產品問題）

| 檔案 | 改了什麼 | 為什麼 |
|---|---|---|
| `helpers.js` | `waitReady`、`gotoTab`、`expectHome`（見 A1）；新增 `waitReadyM1`／`expectHomeM1`／`gotoTabM1`（舊版頁面）、`appSummary`、`liveStartedAt`、`withStartedAt`、`nodeEngine`（子行程 TZ=Asia/Tokyo 跑 engine 算預期值） | V1 選擇器與數字位置 |
| `migration.spec.js`、`import.spec.js` | `phase.startedAt` 預期＝假時鐘 NOW（brief 列的 17 處：migration 8 例、import 1＋7＋1 例）；真實時鐘那一項讀 App 載入時補的值；匯入後的起點＝匯入當下 | brief 指定的 data-guardian 變更 |
| `training.spec.js` | 早上的訓練從訓練分頁 `#tr-start` 開始（今日下一步是打卡）；完成畫面新字串；`plus:true`；中斷提示「上次訓練是 17 天前…」（`banner info`） | V1 |
| `relocate.spec.js` | 卡片位置斷言改「頁首之後第一張」；設定時亮「今日」；`homeShots` 截圖用 `animations:'disabled'`（三環掃入走真實時間，避免截到半途）；「選擇備份檔捲到資料備份卡」改成只在卡片原本不在上半屏時要求捲動；舊網址升級的舊版確認改成「沒有三環」＋依基準有沒有 D24 判斷搬家卡 | 原本寫死 v7 基準「沒有搬家卡」，`efa688c`（v8）已有搬家卡，**在 main 合併 D24 後這 2 項本來就會失敗**，與 V1 無關 |
| `network.spec.js` | 靜態掃描改遞迴並納入 `data/*.json`；准 `rules.js` 的同源 fetch | 原本漏掃 `js/game`、`js/habits` |
| `parity.spec.js` | 見 A2 與退役表；`locator.screenshot` 改 clip（假時鐘暫停時 rAF 不跑，元素穩定檢查會卡住） | — |

## 植入缺陷（暫存副本 `qa-b1/mut/<名稱>/`，worktree 沒動；紀錄 `qa-b1/mut/*.log`、`summary.txt`）

| # | 缺陷 | 改法 | 抓到的測試 |
|---|---|---|---|
| m1 | 打卡寫兩筆 | `checkin.js` 寫入後再 push 一筆並存檔 | `C`「寫入剛好 1 筆」 |
| m2 | 復原沒有刪 | `undo()` 不呼叫 `removeSleepEntry` | `C`「10 秒內按復原」 |
| m3 | 12:00 後仍開放 | `game.json` `untilHour` 13 | `C`「打卡時段」（12:00 engine 應關閉） |
| m4 | 規則檔讀不到就崩潰 | `home.js` 少了 `!sum` 判斷 | `T`「規則檔」3 例 |
| m5 | 分頁列半透明 | `#tabs` 底色 `rgba(255,255,255,.85)` | `A`「分頁列不透明」 |
| m6 | 加一輪記成 type `plus` | `trainhub.js` | `training.spec.js`「加一輪」 |
| m7 | 訓練紀錄用日曆日 | `session.js` 改回日曆日 | `T`「遊戲日」 |
| m8 | 完成畫面增加量可為負 | `train.js` 拿掉 `Math.max(0, …)` | `training.spec.js`（應為 +0） |
| m9 | 次要文字對比不足 | `--c-ink-2:#A3A69F` | `A`（116 個文字不合格） |
| m10 | 觸控目標太小 | `.link-btn` 高 30px | `A`（「只有 3 分鐘？做保底版」等） |
| m11 | 減少動態沒有改淡入 | 刪 reduced-motion 規則 | `reduced-motion.spec.js` 靜態＋reduce 執行期 |
| m12 | 統計顯示舊 XP | `stats.js` 用 `st.xp` | `T`「統計」 |
| m13 | AFT 卡用最近一次 | `aft.js` 只取最後一筆 | `T`「AFT 卡」 |

## 觀察（不影響判定）

1. **階段起點的兩套規則**：engine 在沒有 `startedAt` 時以第一筆早安打卡為第 1 天；但 `loadState()` 與匯入後一律用「當下」補上，所以 App 裡 engine 的這條規則不會用到。帶打卡紀錄但沒有起點的備份匯入後，會從「第 1 天」重算（`T` 的 P1→P2 測試因此明確給起點）。是否要讓 D 改用第一筆打卡日，請 G＋D 決定。
2. 規則檔讀不到時，今日右上的連續天數退回舊欄位 `streak.current`，可能是已中斷前的數字（例：`v3-checkin` 在 10-05 顯示 14）；這是 M1 行為（brief：退回 M1），只在規則檔壞掉時出現。
3. 有紀錄但中斷幾天時，今日連續天數會顯示 0（engine 規則：今天或昨天沒練就是 0，例：v2-real 在 10-02）。語氣中性、不扣 XP，符合原則 8；只是和 M1 首頁（顯示舊的 9）不同，Cross 看到可能會問。

## Cross iPhone 真機清單（只列機器驗不了的）

- [ ] 主畫面 App 早上點「我起床了」：馬上出現「已記錄起床 HH:MM · +N」和「復原」，10 秒內按得到；「修改時間」的 iOS 時間選擇器可以把起床改早、改晚於現在會跳回並提示。
- [ ] 亮色畫面在 iPhone：狀態列文字看得清楚；分頁列不透明，最後一張卡片捲得到分頁列上方（含下方 Home 橫條的安全區）。
- [ ] 從 v8 自動更新到 V1：主畫面 App 從背景切回時自動換新版一次、訓練紀錄都在；之後開飛航模式冷啟動，三環與早安打卡照常。
