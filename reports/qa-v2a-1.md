# QA 驗收報告 — V2a 遊戲核心（第 1 輪）

| 項目 | 內容 |
|---|---|
| 受測 | `v-next/v2a` @ `1e4c722`（main `1b49637`＝SW v10 之上 11 個 commit：D28 文件、data-guardian、game-designer、ui-engineer、orchestrator）。驗收分支 `v2a/wt-qa`，**產品碼未改**，只改 `tests/e2e/**` 與本報告 |
| 產品變更 | engine：`js/game/{engine,rules,timeline}.js`、`js/habits/deload.js`、`data/game.json`（d9–d15）；資料：`js/state/{game,schema,migrate}.js`＋3 個 fixture；UI：`js/ui/{celebrate,home,game,train,trainhub,boss,program,setup,toast,icons}.js`、`index.html`、`css/{app,tokens}.css`、`js/app.js`；`sw.js` v10 → v11（ASSETS 加 `celebrate.js`、`state/game.js`、`game/timeline.js`、`habits/deload.js`）；sim：`tools/sim/**` |
| 基準 | 等價比對 `ec87e03`（`PARITY_BASE_DIR`＝`<scratchpad>/main-ref`）；更新路徑＝目前線上 v10（`UPGRADE_BASE_DIR`＝`<scratchpad>/main-v10`，v10 → v11 是真的） |
| 環境 | 2026-10-07，本機 Linux 4 核；Playwright 1.56.1／Chromium headless；375×667、isMobile、hasTouch、zh-TW、Asia/Tokyo。**非真機** |
| 指令 | `PORT=4850 BASE_PORT=4860 QA_UPGRADE_PORT=4851 PARITY_BASE_DIR=<scratchpad>/main-ref UPGRADE_BASE_DIR=<scratchpad>/main-v10 npx playwright test`（`BASE_PORT` 改 4860 的原因見觀察 3） |

證據檔在 `<scratchpad>/qa-v2a/`（`<scratchpad>` = `/tmp/claude-0/-home-user-daily-ten/9755df85-8ada-5bad-b0f4-c2b277588976/scratchpad`），下文用相對路徑。

## Verdict：`PASS`

- 最終 commit（`8457452`，只差本報告）全套 **938 passed／0 failed／0 skipped**（單元 688＋e2e 250，9.1 分，exit 0；`full-2.log`）。`UPGRADE_BASE_DIR`、`PARITY_BASE_DIR` 都有設：v10 → v11、v5 → v11 的更新測試、ec87e03 等價比對都有跑。
- 改測試前（`1e4c722` 原樣）：864 passed／28 failed（`baseline-run.log`）。18 項是 V2a 刻意改的行為，已照新規則改寫（下表）；10 項是指令的 port 衝突（`EADDRINUSE 127.0.0.1:4852`），跟產品無關。
- 新增 46 項 e2e（`v2a-core.spec.js` 37、`v2a-a11y.spec.js` 5、`reduced-motion` +2、`auto-update` +2）。
- `node tools/sim/run.mjs`：exit 0、10 條判準全部 PASS；跑兩次只有耗時那一行不同（決定性；`sim.log`、`sim-2.log`）。
- `node .github/scripts/check-repo.mjs` exit 0（App 檔 51、預快取 52、CACHE v11、main v10）；`check-glossary --self-test` 108/108；`--ci --no-report` 掃 45 檔、1,000 筆：**新增 0、既有 0**。
- 植入 10 個缺陷（只改暫存副本）：**10/10 被抓到**；沒改的對照組 37/37 通過。
- 產品缺陷 1 項（低，不擋）：連點兩下「領取」會把升級卡一起按掉（BUG-1）。另有 2 項規格觀察給 Cross／G 決定（觀察 1、2）。

## V2a 完成條件（CLAUDE.md §8 V2a 列）

| 條件 | 結果 | 證據 |
|---|---|---|
| sim 三人設曲線合理 | PASS | C1–C10 全 PASS。Lv（第 7／14／30／60／90 天）：認真 4／6／10／15／18、普通 3／5／8／12／15、常中斷 2／3／6／8／11；bonus 佔比 23／28／34%；Perfect Day 每週 6.1／4.1／2.1；Freeze 用 5／2／0；常中斷回歸徽章 15、加成 14。純 Node、離線、不寫檔（跑完 `git status` 乾淨） |
| engine 單元測試覆蓋本版規則 | PASS | `game.v2a.spec.js` 72 項：Perfect Day（d9，含解鎖新支柱後不消失、週一起算）、Freeze（d10，6／7／21 天、漏 1／2／3 天、補上的日子不算進下一張、今天不算漏）、D6（d11，359／360、89／90／91、存下的目標、L1、恢復只當天、練完不顯示）、D19（d12，第一次不算、只打卡也算活躍、×1.5 只乘基礎、每次中斷一次、四捨五入）、等級含 bonus（d13）、壞資料 fuzz 400 份、只加不減 60 天 × 30 份。`state.game.spec.js` 44、`game.sim.spec.js` 7 |
| e2e：慶祝／升級卡／降量／回歸 | PASS | `v2a-core.spec.js` 37 項全過（下表「行為對照」） |

## 行為對照（brief 的 Key behaviour）

| 行為 | 結果 | 證據（`tests/e2e/`） |
|---|---|---|
| Perfect Day：打卡＋保底版 → 卡片一次、字串逐字、數字＝engine；「領取」才寫 `game.seen.perfectDay`；重新整理不重播 | PASS | `v2a-core:134`：完成畫面 `#d-bonus`＝「含 Perfect Day +30 XP」、增加量＝保底 30＋30；卡片 eyebrow／title／「+30 XP」／一句話／三格（連續天數 23、本週 Perfect 2、今日 XP 120＝engine）／「領取」、焦點在按鈕；顯示中 storage 不變；領取後 `{level:7, perfectDay:'2026-10-06'}`；換頁、重新整理、同日再練一次都不再播，第二次訓練沒有 `#d-bonus` |
| 開啟時今天已完成（V2a 之前就完成）→ 不播、存檔前不寫入 | PASS | `v2a-core:180`（v3-checkin-reverted-to-v2 @ 10-04 07:30）：換 5 個頁面＋15 秒都沒有卡片；storage 只有主 key 且逐字＝fixture；記憶體 `seen.perfectDay`＝今天；存檔後才寫入。`v2a-core:199`：V1 資料第一次開啟（今天還沒練）→ 練完照常播一次、沒有升級卡 |
| 時機：訓練／完成／Boss 成績畫面不播；復原 toast 顯示中先等 | PASS | `v2a-core:265`（toast 10 秒內不播，收起後播）、`:284`（收起時在訓練分頁 → 不播、不記看過，回今日才播）、`:298`（按 toast 的「復原」→ 不播、seen 不變）、`:314`（toast 在訓練中收起 → `#cele` 沒有在訓練畫面底下偷偷打開；完成畫面也沒有）、`:332`、`:705`（Boss 完成畫面） |
| 升級卡：Perfect Day 之後、每級一次、「繼續」才寫 `seen.level`；第一次開啟不補發 | PASS | `v2a-core:370`（engine 找出差 10–50 XP 升級的資料 → 先慶祝、再「升到 Lv 8」、`#cele-xp` 隱藏、三格＝engine；顯示中 storage 不變；寫入後換頁／重新整理不再出現）；`:401`（bonus 讓等級比 V1 算法高一級 Lv7 → Lv8，第一次開啟也不補發、不寫入）；`:427`（一次跳兩級只出「升到 Lv 7」一張） |
| Freeze：每 7 天 1 張、最多 2 張、整段補得起才用；補上的天只接起來；回溯只增不減 | PASS | `v2a-core:462`（7 天得 1 張 → 漏 1 天隔天自動用、`#h-freeze-n` 1 → 0、`used`、aria-label 含說明、展開說明、練完連續 8 天）、`:507`（漏 2 天只有 1 張 → 不用、連續 0、張數仍 1、最佳 7）、`:528`（28 天仍 2 張）、`:540`（從沒得過 → 不顯示）、`:547`（5 個 fixture 用 v10 engine 對照：連續、最佳、XP、等級都沒有變小，例 v3.json 連續 12 → 19） |
| D6：熄燈 01:45／起床 06:41 → 降量卡；下一步、訓練分頁、實際跑的序列＝L-1；恢復／復原；邊界；L1 與練完不顯示；`state.level` 不變；v3-v2a 已恢復 | PASS | `v2a-core:632`（卡片「昨晚睡 4 小時 56 分」／「今天先改成 L2，輕一點也算數。」／「恢復 L3」；`#h-start`、`#h-minimal`、`#tr-plan-meta`、`#tr-start[data-level]`、一週表今天那列＝L2；從今日與訓練分頁實際開始的步數＝L2 序列（≠L3），保底版的貓牛式是 L2 劑量；恢復 → `restoredOn` 寫入、卡片「已恢復 L3」沒有按鈕、課表回 L3；復原 → `null`；重新整理後仍已恢復）、`:705`（週日 Boss 暖身＝L2）、`:756`×4（359 降／360 不降／89 不降／90 降，分鐘數由 engine 算）、`:782`（L1）、`:795`（練完）、`:818`（v3-v2a @ 10-05 20:00；拿掉當天訓練 → 「已恢復 L3」；隔天 `restoredOn` 不算數） |
| D19：中斷 → 徽章 → 3 天內第一個 2 支柱日 ×1.5（今日卡＋`#d-bonus`，增加量＝engine）→ 不再加成 | PASS | `v2a-core:851`：return 卡（不提天數）→ 打卡拿徽章（`×1.5` 粗體）→ 隔天「2 天內」→ 打卡＋保底版：`#d-bonus`「含 Perfect Day +30 XP、回歸加成 ×1.5 +45 XP」、增加量 105＝30＋30＋45、卡片 `banner quest boost`；第 3 天 2 支柱只有 +30、沒有回歸卡 |
| D23：慶祝卡開著或恢復 toast 顯示中 → 不重新載入 | PASS | `auto-update:367`（卡片開著：新版就緒後真實 4 秒＋假時鐘 6 秒都沒重新載入、storage 不變；領取後 2 秒內換成 v12，重新載入後不再播）、`:391`（D6 恢復 toast 10 秒內不重新載入） |
| 開 App 不寫入（`game.seen` 只在記憶體，下次存檔才寫） | PASS | `v2a-core:933`×3（含開 App 就出現慶祝卡的情況：領取只改 `game.seen.perfectDay`，其餘逐欄＝fixture）；`migration`、`import` 的 pre-import 也驗證 |
| 動畫只用 transform／opacity、≤1.5 秒；減少動態只淡入 | PASS | `reduced-motion:47`（`cele-pop`、`cf-fall` 只有 transform／opacity；reduce 改 fade-in；訓練中暫停；token 320 ms、1150＋300 ms）、`:187`×2（實測：no-preference 28 個動畫都 ≤1.5 秒、不是無限；reduce 只有 opacity、彩帶 `.cf.still` 26 片、卡片 transform none） |

## Definition of Done（CLAUDE.md §9）

| # | 項目 | 結果 | 證據 |
|---|---|---|---|
| 1 | `npm test` 全綠 | PASS | 938/938（`full-2.log`）。首頁、訓練流程、遷移、離線重開、匯入壞檔不白屏都在內 |
| 2 | `sw.js` CACHE +1、新檔案在預快取 | PASS | v10 → v11；4 個新 module 都在 ASSETS（check-repo 通過；`v2a-core:1106` 逐一確認）。v10 → v11 實際更新 2,926 ms、只導向一次（`upgrade.spec.js:143`） |
| 3 | `demos.js` `MAP`/`def`、`content.js` `VIDEOS` | N/A | 本版沒有新增或修改動作（兩檔 diff 為 0） |
| 4 | `PROJECT_STATE.md` 決策／踩坑、README 網址 | 部分（待 Orchestrator） | README 正式網址正確；CLAUDE.md／PLAN.md／HANDOFF 已有 D28。`PROJECT_STATE.md` 還沒有 V2a（d9–d15 拍板、SW v11、觀察 1–4 的踩坑），PR 前補 |
| 5 | §11 用語表 | PASS | CI 檢查新增 0；e2e 對慶祝卡、升級卡、Freeze 說明、降量卡、回歸卡、`#d-bonus`、toast、匯入錯誤訊息都跑 `expectGlossaryClean` |
| 6 | qa-checker PASS | PASS | 本報告 |
| 7 | Cross iPhone 真機清單 | 已列 | 文末 3 條（PR 描述由 Orchestrator 附） |

## qa-checker 固定清單

| # | 項目 | 結果 | 證據 |
|---|---|---|---|
| 1 | `npm test` 全部 | PASS | 同 DoD 1 |
| 2 | 遷移 v1／v2／v3／被改回 v2，跑兩次相同 | PASS | `migration.spec.js` 13 項（每個存檔都加驗 `game.seen`＝engine、沒有多出 `game.deload`、開啟時沒有慶祝）；V2a fixture：`v2a-core:984`（v3-v2a-reverted-to-v2 兩個 context 逐字相同、打卡 4 筆不重複、xp 424 不是 845）、`:1025`（**真的用舊版 App ec87e03 來回**：舊版存回 version 2 仍保留 `seen`／`deload`，新版再開不重複、不重播） |
| 3 | 匯入壞檔 | PASS | `import.spec.js` 原有的壞檔全過；`v2a-core:1063`：v3-v2a-bad-fields 匯入回 3 筆錯誤（逐字），所有 key 不變；載入時修補、錯誤卡、原字串在 `bak-v3`、不白屏；`:956` 好檔來回保留 `seen`／`deload` |
| 4 | 離線 | PASS | `offline.spec.js` 2 項；`v2a-core:1106`：V2a 新 module 都由 SW 供應，離線打卡 → 慶祝 → 領取寫入，0 個請求打到網路 |
| 5 | 遊戲日 03:59／04:01、時區 | PASS | `v2a-core:221`（10-06 03:59 播 10-05 的 Perfect Day；04:01 不補播、不寫入）；04:00 換日與時區 offset 由 `game.day.spec`、`game.sleep.spec`、`v1-today:161` 覆蓋，V2a 的時間線用同一套遊戲日 |
| 6 | 階段條件 | PASS | 本版不改階段；`v1-today:291`×2（9／10 天）與單元測試全過 |
| 7 | `prefers-reduced-motion` | PASS | 同上「動畫」列 |
| 8 | 前端掃描 | PASS | check-repo exit 0；`network.spec.js`；每個 e2e 都有 guard（只准 127.0.0.1） |
| 9 | 用語表 | PASS | 同 DoD 5 |
| 10 | DoD | PASS（DoD 4 待補） | 見上表 |

可及性（`v2a-a11y.spec.js` 5 項）：對比不合格 0、觸控目標太小 0。最低值：`#cele-xp` 5.40:1、`#d-bonus` 6.36:1、`#h-deload-restore` 6.51:1、`#h-deload-sub` 8.11:1；`#h-freeze` 47.8×44、`#h-deload-restore` 74.8×44、`#cele-ok` 279×56。慶祝卡 `role=dialog`、`aria-modal`、標題／說明有連結、出現時焦點在按鈕。截圖 `shots/v2a-*.png`（8 張）。

## 改過的測試（Phase A）

| 檔案：行 | 改法 | 理由 |
|---|---|---|
| `training.spec.js:31、41` 與 `:96`、`:158`、`:191`、`:230`、`:246`、`:303`、`:357` | 新增 `engineAfter`：engine 在 Node 對「fixture＋這次應記下的訓練」算連續天數，取代寫死的 13／10／11／14／15／1；另外斷言意圖：當天第一次練＝練之前＋1、同一天再練不變、空檔補不起從 1 開始。legacy streak（D12）的斷言不動。`expectDone` 加「沒有 `#d-bonus`」 | Freeze 回溯：v3.json 09-19 的空檔被補上，連續天數 12 → 19（只增不減） |
| `training.spec.js:306–318、348–353` | V1 中斷提示 → D19 回歸卡：`banner quest`、`data-stage=return`、文字＝engine label＝`data/game.json` 原文、不含「天前／中斷」、保底版連結仍在；練完 Boss 後是 `badge` | brief：回歸卡取代 V1 的「上次訓練是 N 天前」 |
| `v1-today.spec.js:194` | 「連續 1 天」→ engine 算（20），並斷言 10-02、10-03 由 Freeze 補上 | 2 張 Freeze 補得起 2 天空檔 |
| `import.spec.js:176`、`:312`、`:448` | pre-import 預期＝fixture＋`phase.startedAt`＋engine 算的 `game.seen`（`helpers.withSeenAtOpen`）；`:192–205` 另驗匯入後補上 `seen`、下次存檔寫入 | `ensureSeenInitialized` 開 App 時只改記憶體，覆蓋前另存的是記憶體內容 |
| `migration.spec.js:64、80–84、100、221、244–246` | v3.json 存檔＝fixture＋startedAt＋seen；每個 fixture 驗 `seen`、沒有 `deload`、開啟時沒有慶祝；B1 兩個 fixture 驗 `seen.perfectDay`（今天已完成 → 今天，否則前一天） | 同上 |
| `parity.spec.js:497–505` | 新版 `todayPlan()` 多一個 `plan.lv`：先斷言 `lv`＝`state.level`（沒有降量），再拿掉與 ec87e03 逐欄比對 | D6 的新欄位（ui-engineer 的清單漏了這一項，見觀察 4） |
| `reduced-motion.spec.js:47`、`:187`×2 | 靜態規則加 `cele-pop`、`cf-fall`、reduce 對應、訓練中暫停、時間 token；新增實測 | brief：放行新動畫、規則照樣強制 |
| `helpers.js` | 新增 `seenAtOpen`、`withSeenAtOpen`、`liveSeen`、`celeState` | 共用 |

## 新增的測試（Phase B）

`v2a-core.spec.js`（37）、`v2a-a11y.spec.js`（5）、`auto-update.spec.js:367、391`（D23）、`reduced-motion.spec.js:187`×2。各項見「行為對照」與固定清單。預期數字都由 engine 在 Node 算；規則層面的斷言（例：「不再加成」「張數保留」「359 降、360 不降」）寫成絕對值，所以 engine 本身被改壞時也抓得到。

## 植入缺陷（只改 `qa-v2a/mut/` 的副本，不碰 worktree）

腳本 `scripts/mutate.py`（複製 `8457452` 的樹、套一處字串替換）、`scripts/run-all-mut.sh`。每個副本跑 `v2a-core.spec.js`（m5 另加 `migration`、`import`）。對照組 `mut/base`（沒改）**37/37 passed**（`mut/base.log`）。**10/10 都被抓到。**

| # | 缺陷 | 結果 | 抓到的位置（`v2a-core.spec.js` 行號，除非另註） |
|---|---|---|---|
| m1 | 慶祝播兩次（`celebrate.js` `dueKind` 的 `>` 改 `>=`） | 16 failed | `:134`（換頁回來又出現）、`:180`、`:199`、`:246`×2、`:332`、`:370`、`:427`、`:547`、`:705`、`:795`、`:818`、`:851`、`:956`、`:1063`、`:1106` |
| m2 | 訓練／完成畫面開著也播（`screenBlocked` 拿掉 `#train`、`#done`） | 1 failed | `:314`（toast 在訓練中收起 → `#cele` 在訓練畫面底下被打開） |
| m3 | 實際跑的序列不管降量（`trainhub.js` `runPlan` 用 `state.level`） | 2 failed | `:632`（步數＝L3）、`:705`（Boss 暖身） |
| m4 | 回歸加成給兩次（`timeline.js` 拿掉 `boostNum === null`） | 1 failed | `:851`（第 3 天又加成） |
| m5 | 開 App 就寫入 `seen`（`ensureSeenInitialized` 呼叫 `persist()`） | 18 failed／47 passed | `:180`、`:199`、`:401`、`:933`、`:1063`；`migration:139`×8（每個 fixture「存檔前主 key 不變」）、`:193`、`:257`×2；`import:109`×2 |
| m6 | 空檔補不起也用 Freeze（`timeline.js` 張數不夠照用、接上） | 1 failed | `:507`（張數應保留 1、連續應為 0） |
| m7 | 慶祝之後不接升級卡（`close()` 拿掉 `queueCelebrations`） | 5 failed | `:246`×2、`:370`、`:427`、`:851` |
| m8 | D6 時數邊界錯一分（`<` 改 `<=`） | 2 failed | `:756`「睡 360 分 → 不降」、「熄燈晚 90 分」（360 分也被算成短） |
| m9 | 慶祝蓋住復原 toast（拿掉 `toastVisible()` 等待） | 4 failed | `:265`、`:284`、`:298`、`:314` |
| m10 | `#d-bonus` 每次都顯示 Perfect Day（拿掉「這次才達成」的判斷） | 2 failed | `:134`（同日第二次訓練）、`:332` |

engine 的缺陷（m4、m6、m8）預期值雖然也由同一份 engine 算，但規則層面的斷言是絕對值，所以照樣抓得到。

## 產品缺陷

### BUG-1（低，不擋）：連點兩下「領取」會把升級卡一起按掉
- 位置：`js/ui/celebrate.js:180–186`（`close()` 記成看過後同步呼叫 `queueCelebrations` → `show('level')`），`:159`（同一顆 `#cele-ok`、同一個位置，`onclick = close`）。
- 重現（Chromium，`zz-probe` 探索測試）：v3-v2a.json 把 `game.seen` 改成 `{level:6, perfectDay:'2026-10-04'}`，2026-10-05 20:00 開 App → Perfect Day 卡出現 → 在「領取」上雙擊（或兩下 tap 間隔 150 ms）。
- 結果：`#cele` 收起，`game.seen`＝`{level:7, perfectDay:'2026-10-05'}`——「升到 Lv 7」只出現約 150 ms 就被第二下按掉，之後不會再出現。
- 預期：每個新等級的卡片要看得到（例如卡片換內容後 1 秒內的點擊不算，比照匯入確認的連點保護）。升級常和 Perfect Day 同一天發生（+30 推過門檻），這個組合不少見。
- 建議由 ui-engineer 修；iPhone 上的雙擊是否也會觸發見真機清單第 2 條。

## 觀察（不影響本輪判定）

1. **D6 只管今天的第一次訓練**（給 game-designer／Cross 確認）。`js/habits/deload.js:72–80`：`active` 需要「今天還沒練」，`planLevel` 跟著 `active`。所以睡不到 6 小時、先做 L2 保底版之後，同一天的「再練一次」、今日課表、加一輪都回到 L3（探索測試：`#tr-start[data-level]`＝3、`#tr-plan-meta` 沒有「今天先改成」）。d11 有寫「練完就不顯示降量卡」，但 CLAUDE.md D6 是「當日預設降一級」、brief 是「今天到處都降一級」。要不要讓降量撐到當天結束，請 Cross 單選。
2. **V1 的「上次訓練是 N 天前」還在**（給 Orchestrator 確認）。`js/ui/home.js:123–139`：只有回歸任務進行中才換成回歸卡。每天早安打卡、但幾天沒練時，D19 不算中斷（打卡也是活躍日），今日仍顯示「上次訓練是 4 天前。從保底版重新開始就好」。契約寫回歸卡「取代」V1 提示；文字仍是中性陳述（原則 8 沒有違反），是否保留請決定。
3. **brief 的指令會撞 port。** `BASE_PORT=4852` 等於 `QA_UPGRADE_PORT=4851`＋第 2 個 worker 的 index 1，本機 2 workers 時 `auto-update` 9 項、`upgrade` 1 項 `EADDRINUSE 127.0.0.1:4852`（`baseline-run.log`，改測試前就這樣）。改用 `BASE_PORT=4860`。CI 用預設值（4173／4174／4477），不會撞。
4. **ui-engineer 的失敗清單少一項。** `parity.spec.js:472`（課表資料等價）因為新的 `plan.lv` 失敗，有設 `PARITY_BASE_DIR` 才跑得到；已改寫（上表）。
5. **fixture README 的 streak 是 legacy 欄位。** 例：v3-v2a「streak 1 / 14」，畫面（engine＋Freeze）是 22。不是缺陷，但對照 README 看畫面時容易誤會。
6. **同一天可能同時看到「Freeze 接上連續天數」與「回歸任務」。** Freeze 跟著訓練日、D19 跟著活躍日，漏練 1 天的隔天兩張卡都會出現（例：9/28 的截圖）。照 d10／d12 的設計，只是提醒文案可能讓人疑惑。

## Cross iPhone 真機清單

- [ ] 主畫面 App 自動更新到 v11：開舊圖示，閒置幾秒後自己換新版，設定最下方顯示「App 版本 v11」。如果剛好跳出 Perfect Day 卡，要按「領取」之後才換版。
- [ ] Perfect Day 卡：彩帶 1.5 秒內落完、不卡頓；打開「設定 › 輔助使用 › 動態效果 › 減少動態效果」後只淡入、彩帶不飛；在「領取」上快速點兩下，看「升到 Lv N」會不會被跳過（BUG-1）。
- [ ] 今日右上：連續天數、Freeze 張數、齒輪在同一列、不換行、不被瀏海／動態島擋住；點 Freeze 展開說明；睡不到 6 小時打卡後，降量卡的兩行字與「恢復 L3」按鈕排得下。
