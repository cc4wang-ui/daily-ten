# Daily-Ten 完整 MD（開發規格，2026-11-03 定版）

> 本節 §0 是權威決策，優先於後面所有內容。當後面研究建議與 §0 衝突時，以 §0 為準，不得直接按研究路線圖開工。
> 狀態：2026-11-03 使用者已確認品味三題（T1/T2/T3），技術決策門 8 項已由助理解決（見 §0.1-§0.8），其餘待查證項見 §0.10。
> 開發基準：PR #28 head `215a06971b9dc629e4de03f87a392c6ad8412031`（本地全綠、GitHub CI 未確認、PR #28 當時仍 open 未合併；開發分支應以此 head 為起點，不得以 main 484c587 為起點而丟掉 PR #28 的獎勵邏輯）。
> 語言：繁體中文；專有名詞、URL、識別碼照原文。

## §0.1 決策門（已解決）
1. **PR #28 與 XP 遷移**：PR #28 合併方向確定；不採用研究封頂 XP 制。舊 XP 不追溯倒退，等級曲線不變；研究封頂 XP、Perfect Day +10、PR +5 一律不實作。
2. **Freeze vs 暫停**：分工並存，暫停優先。暫停（Rest/Sick/Travel，主動宣告）日不耗 Freeze、不計連續、不計 Perfect Day、不計 28 天分母；Freeze 只補非暫停的意外缺席日，每 7 個實際訓練日得 1 個、最多 2 個，凍結日不計連續。
3. **順序制**：漏掉或改居家一律保留序位，僅不補做雙倍。健身房順序 Upper A → Lower A → Upper B → Lower B；研究 §3.4「漏掉即跳過」一句作廢，改為「漏掉即保留」。
4. **Perfect Day 過渡**：探索鎖定期算動＋眠 2 支柱；P2 解鎖（14 天內 10 次起床，條件不作廢）後改算動＋眠＋探 3 支柱，過渡當天介面寫明定義已改變。
5. **PR XP**：不廢止 d16，PR 維持非 XP；研究 PR +5 不實作。
6. **儲存 vs 衍生**：沿用衍生制。XP、連續、Freeze、Perfect Day、週目標一律由紀錄每次重算，不存 `xp_total`、`current_run_days` 等衍生欄位；`perfect_day` 不存欄位；已完成 session 永不被舊計畫列覆寫，衝突另存副本供確認。
7. **模板與安全**：健身房模板以 reel 為準，不發明 A/B 差異。A/B 只有在使用者有兩套不同動作組合時才出現，否則 A=B=同一套。上肢 7 動作各 2 組、下肢 6 動作各 2-3 組（見後 §1.5）；次數沿用充實建議（複合 6-10、孤立 10-15、雙重漸進、保留 1-2 下餘力、力竭只偶爾用在安全器械孤立動作最後一組）；任一動作回報疼痛，當天停該動作、該動作進步暫停（progression_hold）。本模板仍是草案，正式出貨前須教練驗證簽核。
8. **Vercel 與現況功能**：Vercel 介面退役並匯入 daily-ten，不平行並存；匯入驗證通過後再下線。現況功能保留：語音導引計時器、Boss Day（=加一輪）、星期課表（居家預設建議日，不綁死順序）、回歸 ×1.5、慶祝卡／`game.seen`、三環 UI、PR #28 里程碑徽章；待定只有 ≥30 成就收藏計畫（不在 MVP）。

## §0.2 使用者品味決定（2026-11-03 已確認）
- **T1 慶祝感**：強一點，upbeat 的視覺和頁面。XP 數值不改，但慶祝卡、里程碑、文案要大方明亮，不是安靜隱藏風。
- **T2 訓練節奏**：每週 4 天健身房，星期不固定，依使用者行程、由使用者自己決定哪一天去，達標率仍為 x/4。每天早上 15 分鐘伸展，時間不夠用 5 分鐘短版，短版也算完成當日伸展；伸展不計入健身房達標率。
- **T3 探索**：探索 = 助理用 web search 隨機餵一個具體、可一次完成的初學者任務，目的是有效探索新的興趣，不是由使用者自己想。第一次只測試活動本身，第二次在平常日重啟才算真的有興趣；不喜歡就丟掉，下次換類別。第一個任務（2026-11-03）：澀谷 melodica 體驗（週一至週五 19:00-21:00、2 小時、約 $32.72、最多 3 人、初學者友善）。
- **洗牌按鈕**：2026-11-03 使用者要求並已在對話中交付一個探索洗牌 widget，內含 14 個任務（澀谷 melodica、書法、筷子製作、壽司課、古幣戒指、可愛角色壽司、免燒陶土、手機主題拍照、不提筆素描、一條街觀察散步、一頁日記、三種食材挑戰、摺紙書籤、初學者西洋棋謎題），按一次快速轉幾下再停在一個新的，不連續重複。開發時應把洗牌機做進 Explore 支柱，而不是只留在對話 widget 裡。

## §0.3 路線圖（已重排，不按研究週數直接執行）
- **Phase 0（先做）**：Today 重建（健身房日由使用者自選、不是固定星期）、寬容連續（§0.1 門 2 規則）、最小課、晨間伸展 15/5 分鐘例行、1 個使用者自定時間提醒（未完成才提醒）、匯出／刪除、離線測試、upbeat 慶祝呈現、探索洗牌機。
- **Phase 1（健身房 MVP）**：模板（reel 為準）、序列引擎（門 3 規則）、預填記錄、可暫停計時器、雙重漸進建議、PR 清單、健身房達標率 x/4；不做自訂課表 builder（Plan 頁只能改建議日與同肌群 swaps，不能改組數／動作庫）。
- **Phase 2（強化不擴張）**：先做無障礙稽核（WCAG AA、44pt、VoiceOver、200% 文字、Reduce Motion），再做 Strong／Hevy CSV 匯入、量測儀表板；Day-30 回訪率改為滾動觀察，不設 4 週內驗完的硬門檻。
- 砍功能門檻統一為每週使用率低於 10% 就砍；首頁只顯示 2 條進度（健身房達標率 x/4、本週 Perfect Day X/5），28 天活動率、量趨勢、睡眠趨勢只放 Progress 頁。
- 最小課／散步防刷分：最小課（熱身＋主動作）計 Movement、計活動日，但不計完整健身房課；散步計活動日，不計 Movement、不計 Perfect Day；完整課＞最小課＞散步，不得同分。
- 暫停名稱統一：Rest（休息日，可計分但不計健身房達標率）、Sick、Travel（暫停狀態，凍結計時）；Break 併入 Rest。模式預設：新使用者預設 Home，標記已加入健身房時建議切 Mixed，刪掉無條件的 (recommended) 標籤。
- 單機 vs 雲端：先做單機＋匯出（IndexedDB＋CSV／JSON 匯入匯出），雲端同步延後到 Phase 2 之後再評估；睡眠維持現況三段梯度手動記錄，PWA 不宣稱穿戴同步。
- MVP 資料模型：User、Day、SessionTemplate、TemplateExercise、Exercise、WorkoutSession、SetLog、PersonalRecord、ProgressionState（僅健身房雙重漸進）、WeekPlan、StreakState（衍生，不存欄位）；同步、帳號刪除等移到雲端決策之後。
- 每週至少 1 天系統排休，排休日 Today 顯示恢復文案＋下次課表預告，不計健身房達標率。

## §0.4 開發啟動（2026-11-03 使用者指令：直接進行開發）
- 先從 Phase 0 開始，不得一次把 Phase 1、Phase 2 全做完再測試。
- 測試完才能交付：每一步都要跑適用測試，最好組織 red team 審查；測試沒過或沒測過，不得稱完成，須老實說缺口。
- GitHub 操作合併成最少次數，不要按檔案／步驟分開送審。

## §0.10 仍未驗證（不是決策，是待查證）
- PR #28 的 GitHub CI 狀態；v30→v31 快取真機升級；P2 解鎖後 Perfect Day 實際運作；調研頁面比較表手機篩選（桌機已通過，手機未再實測）；領先 App 價格（roundup，未對原始商店頁）；留存率單一百分比（不可引用）；習慣科學數字為二手引用；AFT 評分表（未重現，須官方量表）；daily-ten 是否已有後端（研究假設 PWA only）；Vercel 獨立頁面抓取驗證。

---

# Daily-Ten 完整脈絡文件（給其他 Agent 用）

> 目的：讓任何一個接手的 Agent 在不讀對話紀錄的情況下，也能完整掌握這位使用者的脈絡、daily-ten 專案現況、增肌計畫、產品調研結果與開發方向，並直接繼續工作。
> 日期：2026-11-03（日本時間，Asia/Tokyo）
> 語言：使用者以繁體中文溝通；專有名詞、URL、識別碼一律照原文，不要翻譯或改寫。
> 來源說明：本文件第 1 節之後的研究內容，完整取自 2026-11-03 的深度網路調研報告（`workspace/research_notes/daily-ten-habit-app-research-20261103-0800/report.md`），逐字未刪減 App、表格或數字（審查時以 diff 核對為 0 行差異）；價格與留存率等數字的限制見研究報告首段 Confidence note、§1.1 表頭、§4.4 與 Could not verify 一節，不要把 roundup 價格當成原始商店定價引用。注意：研究內文的 § 號皆指研究報告內部編號，與本文件 §1.x 無關；研究標題層級保留原文，未重編號。

## 1. 背景脈絡（接手前必讀）

### 1.1 使用者與助理
- 使用者：ワン，時區 Asia/Tokyo，溝通語言繁體中文。
- 助理名稱：fahhh。
- 使用者目前的虛擬替身：可愛的大便造型（2026-11-03 啟用）。此前曾走過金城武方向、女性 cliché K-pop idol 方向（曾選左下候選 Option 3，並說 AI 感太重），最後使用者說「算了 替身給我一坨可愛的大便」並選了該組 Option 1；不要把替身改回 idol 或金城武，除非使用者再明確要求。舊 idol brief（盡可能像真人、衣著盡可能露膚）已明確被取代、已廢棄，細節不沿用，接手者不得從舊記憶撿回。

### 1.2 長期規則（不可違反）
- 測試完才能交付：任何工作在測試完成前都不算交付；使用者原話是「最好」先組織 red team 測試／審查完再交付——red team 是強烈偏好，不是把「最好」偷換成絕對強制，但本文件的交付本身已經過 red team 審查。測試跑不了或跑不過時，要老實說哪部分沒測過、卡在哪裡，等通過（例如 CI）再說完成。
- GitHub 操作不要逐步授權：使用者說逐步授權很浪費時間。GitHub 工作要合併成最少次數，不要一個檔案、一個步驟分開送審；授權卡若有 always-allow 選項，應選它（助理本身無法關閉系統授權卡）。
- 訓練方面：使用者沒有舊傷，不需要考慮傷病相關動作（2026-11-03 使用者親自說「沒有 不用考慮」）。

### 1.3 daily-ten 專案現況
- 專案：GitHub `cc4wang-ui/daily-ten`，描述「每日徒手訓練語音導引 PWA — AFT 居家三項達標」，JavaScript PWA。
- 原本的遊戲規則（來自專案檔案，main 484c587 基準）：規則即資料，放在 `data/game.json`（`_notes.decisions` d1-d15，後來 PR 加了 d16）；`js/game/engine.js` 是純粹、決定性的推導函式，XP 永遠不累積儲存，調低任何 XP 值都會讓總 XP 倒退（d6/d14 約束）。
- 三支柱：動／眠／探，規則檔中每支柱每日上限皆為 60 XP，首頁有三環。動的等級：保底版 30／主課表 50／加一輪 60 XP；規則檔 `move.tierByType` 把 boss 類型對應到加一輪，`move.bossWeekday` 記載為 0（星期對照以程式碼為準，本文件不推斷是哪一天）。眠的計分（規則檔 `sleep`）：預設就寢 23:00、起床 07:00，起床 full／near／base 為 30／15／10、熄燈為 20／10／5、時長（目標 420 分鐘）為 10／5／0，`nearMin` 為 30 分鐘；full／near 的完整時間窗定義未載入本文件，實作前須查 `js/game/engine.js` 的睡眠計分程式碼，不得憑數字推斷。探：規則檔上限同為 60 XP，但 P1 程式碼中探索 XP 實際為 0（`exploreXp = 0`，探索紀錄尚無分鐘數欄位），不要把「上限 60」讀成「P1 已可賺 60」。
- 中央等級（已按 `js/game/engine.js` 的 `levelFromXp` 核對修正；草稿原句「下一級需要 200 + 50 ×（等級 − 1）總 XP」語義不準確）：升到下一級所需的「當級增量」是 200 + 50 ×（當前等級 − 1），例如 Lv1→Lv2 需 200、Lv2→Lv3 需 250，累計總 XP 門檻是逐級累加（到 Lv3 共 450）。`data/game.json` 的 `level` 為 `{base: 200, step: 50}`，總 XP 含 bonus。
- Perfect Day（當時 P1 定義：所有已解鎖支柱當天都完成）：+30 XP 進獨立的 `bonus` 桶，環仍封頂 60。
- 連續（Streak）＝訓練日（任何訓練都算）。Freeze：每 7 個實際訓練日得 1 個，最多持有 2 個，自動補缺口，凍結日不計入連續。
- 回歸任務（規則檔 `returnQuest`：`breakDays: 1, windowDays: 3, boostMinPillars: 2, multiplier: 1.5`）：中斷後第一個活動日得徽章（徽章名稱未載入本文件，須查程式碼）；3 天內第一個完成 2 支柱的日子，基礎 XP ×1.5（多出部分進 bonus；Perfect Day +30 不乘）。「3 天內」的起算日（中斷日／回歸日）在本文件未明確，實作前須查引擎的回歸計算，不得憑推斷實作。
- 探索支柱當時是鎖定的（P1；`explore.open = false`；P2 解鎖需 14 天內 10 次起床）。
- 加練（HRP／Plank／兩英里跑）只存 PR，不計課表完成、不計訓練 XP。
- 原本的慶祝只有 Perfect Day 全螢幕卡和升級卡（`js/ui/celebrate.js`，有 `game.seen` 機制各只觸發一次）；訓練完成畫面已有 XP 增量、連續天數、Perfect Day／回歸加成備註。計畫中但未實作：≥30 成就收藏、週目標檔、賽季目標。

### 1.4 遊戲化 PR #28（已完成、本地全綠、CI 未確認、尚未合併）
- 使用者 2026-11-03 要求：參考 GitHub 裡的 daily-ten 專案做遊戲化優化，增強正向回饋與運動動機。
- 新增的回饋全部是衍生、非 XP 的徽章／文案，既有 XP 與等級曲線刻意不變：連續里程碑 3、7、14、21、30、60、90、180、365 天；Perfect Day 連續里程碑 3、7、14、30 天（P1 現況下，Perfect Day 連續日＝當天動＋眠都到齊；探索解鎖後定義待定，見 §1.7 對照表）；本週目標＝週一到週日 5 個 Perfect Day，首頁顯示「本週 Perfect Day X/5 天」；新 PR＝嚴格優於舊最佳（HRP／Plank 更高才算、兩英里跑更低才算、跑步值 0 忽略、第一次成績只是基準不是新 PR、加練算 PR 但不計課表 XP）。
- 改動檔案（生產相關共 9 檔，`js/ui/home.js` 與 `index.html` 分開計數）：新增 `js/game/rewards.js`（純函式、無時鐘／DOM／儲存／網路、壞資料回 null）；`js/game/engine.js` 的 `todaySummary` 多一個 `rewards` 欄位，其他欄位不動；`data/game.json` 新增 `rewards` 區塊＋`_notes.decisions.d16_rewards`；`js/ui/train.js` 完成畫面 `#d-bonus` 也顯示當天里程碑／新 PR 文案（里程碑文案不帶 XP）；`js/ui/home.js`＋`index.html` 新增首頁 `#h-rewards` 一行；`js/ui/boss.js` 在 PR 儲存時做新 PR 偵測（已記錄過的重試不重複慶祝）；`sw.js` CACHE `daily-ten-v30` → `v31`，預快取加入 `./js/game/rewards.js`。另有驗證工具 1 個（不計入上述 9 檔生產相關檔案）：新增 `tools/verify-rewards.mjs`。
- PR：https://github.com/cc4wang-ui/daily-ten/pull/28 ，分支 `gamification-positive-feedback`，基底 main，狀態 open、非草稿、未合併。原始 head `666a71581bec1ca72c9498e04b91bffd0a353305`；後來只改測試檔的 2 個 commit（`275b4e4`、`215a069`，同一則訊息，因 push 工具單一參數上限而分批）把 head 推到 `215a06971b9dc629e4de03f87a392c6ad8412031`（已用 `git ls-remote` 核對分支 head 與 `refs/pull/28/head` 一致）。從 `666a715` 到 `215a069` 的 diff 只有 3 個測試檔，22 行新增、11 行刪除，沒有生產程式碼。
- 測試結果（2026-11-03，背景測試／red team）：本地 verify-rewards、node --check、check-repo、glossary 都通過；red team 30/30 通過（里程碑邊界、Perfect Day 連續、本週目標、新 PR 規則、壞資料、XP／等級不變）。完整 Playwright 第一輪：1003 通過、49 跳過、4 失敗（全是舊測試期望過期，不是 XP 錯誤），4 個失敗分別是：`tests/game.rules.spec.js`（決定清單缺 d16）、`tests/e2e/v2a-core.spec.js` 兩題（`#d-bonus` 精確字串期望）、`tests/e2e/training.spec.js` 一題（`#d-bonus` 隱藏期望）；修測試後第二輪在新 head 上：1007 通過、49 跳過、0 失敗。修測試時還多發現一個被擋住的額外點（不是第 5 個 Playwright 失敗）：d16 文字沒有「理由」二字，測試改成對 d16 精確檢查其設計主張（不進 xp.bonus、不改等級曲線），不是空檢查；另外 `js/game/engine.js` 第 6 行註解仍寫 d1-d15，是舊的，但沒有測試檢查它，未改動。從 `666a715` 到 `215a069` 的 diff 檔案名已用 `git diff --name-only` 核對：`tests/e2e/training.spec.js`、`tests/e2e/v2a-core.spec.js`、`tests/game.rules.spec.js`。
- 尚未確認：GitHub 上 PR #28 的 CI 狀態沒有另外確認；瀏覽器端 v30→v31 快取實際升級流程沒有在真機上驗證；P2 探索解鎖後的 Perfect Day 定義是已知設計邊界（目前只算動＋眠）。
- 本機工作目錄（僅供接手者查證，不要當成已推上 GitHub 的內容）：`~/workspace/daily-ten-orig`（main 乾淨複本）、`~/workspace/daily-ten-gamified`（遊戲化本機複本，另有刻意排除在 PR 外的本機文件 `GAMIFICATION.md`）、`~/workspace/daily-ten-pr28`（第一輪測試複本）、`~/workspace/daily-ten-pr28-fix`（修測試複本，已 reset 到 `215a069`）、失敗詳情 `~/workspace/pw-failures-pr28.txt`、red team 腳本 `~/workspace/redteam-rewards-pr28.mjs`。
- 使用者對 PR 的授權歷程（不要重蹈覆轍）：第一次開分支曾因 GitHub App 403「Resource not accessible by integration」失敗；使用者在 Meta Muse AI 安裝中授權全部 repo 後重試成功。不要在使用者未確認權限前重試 GitHub 寫入。

### 1.5 增肌計畫與 Vercel 介面（與 daily-ten 整合的另一半）
- 來源：使用者分享的 Instagram reel（創作者 fitguykai，顯示名「凱 Kai | I GOT YOU」，台北，2026-11-01 發布），連結 `https://www.instagram.com/reel/DfOwTZszA4h/?mdxt=cWljMnozdGtyczl4`。注意：練習清單來自 Instagram 儲存的 media-understanding 文字摘要，不是逐幀／逐字稿重新驗證；觀眾留言是觀眾討論，不是創作者建議。
- Reel 課表（增肌、給忙碌的人）：每週 4 練，上／下肢分化，每個肌群每週 2 次；創作者 framing 是沒有完美課表，最好的課表是能持續的那個。週一上肢、週二下肢、週三休息、週四上肢（重複，是否與週一完全相同未確認）、週五下肢（重複，是否與週二完全相同未確認）、週六日休息；強調練到力竭。
- 上肢日（依序，各 2 組，共 14 組）：上斜臥推、平板臥推、側平舉、滑輪下拉、上背划船（手肘外展）、二頭彎舉、三頭伸展。
- 下肢日（依序，各 2-3 組，共 12-18 組）：深蹲或腿推、髖鉸鏈（例如羅馬尼亞硬舉）、提踵、內收肌器械、腿後彎舉、腿前伸展。
- 影片文字資料中沒有（不要當成影片內容呈現）：組間休息、節奏、重量選擇、漸進／減載、熱身、冷身、受傷禁忌、醫療警告、週四／週五是否與週一／週二完全相同（摘要只說「重複」）；器材暗示為商業健身房。
- 充實後的一般訓練建議（明確區分於 reel 內容）：熱身 5-10 分鐘輕有氧／動態＋第一個複合動作 1-2 組輕重量熱身組（不計、不力竭）；起始次數複合 6-10、孤立 10-15；休息複合約 2-3 分鐘、孤立約 60-90 秒；多數工作組保留約 1-2 下餘力、動作優先，力竭只偶爾用在安全器械孤立動作的最後一組，全力竭腿日恢復負擔很大、連續兩次表現明顯下滑先降負荷／量；進步以記錄重量／次數、達到範圍頂且動作好時加最小增量（例：上肢約 2.5 kg、下肢約 5 kg），否則先加次數，不要同週同時加重量、組數、天數；時間不夠先做複合、孤立減到 1 組；某動作會痛當天就停該動作；一般健康資訊、非醫療建議，疼痛不適就停。
- Vercel 介面：專案 `fahhh-training-plan`，此為獨立 Vercel 專案，未併入 `cc4wang-ui/daily-ten`，其原始碼位置未載入本文件；已部署並交付，網址 https://fahhh-training-plan-cc4wang-uis-projects.vercel.app ，部署 ID `dpl_3zzgvGb8UfxgUy8gXKn83V75hwmV`，專案 ID `prj_Tnk4pUE9wIk8e0NhOUzl5IOkv3ZT`，建立部署結果為 READY，但未做獨立頁面抓取驗證（不要把「部署結果 READY」讀成「已獨立抓取驗證通過」）。介面有日分頁、每組勾選、重量／次數記錄、當日進度與充實建議。資料只存在開啟裝置瀏覽器的 localStorage（key `fahhh-training-v1`），不跨裝置同步。
- 健康目標：使用者曾說「我想設定一個健康目標」，但 intake 未完成，沒有在 Goals 頁建立健康目標紀錄；目標內容本身尚未確認，增肌僅為目前脈絡假設——若之後回來，要先確認使用者要的目標，再用上述增肌脈絡繼續 intake，不要重問已知的部分，也不要說目標已儲存，更不要跳過確認直接認定目標就是增肌。

### 1.6 其他進行中事項（簡述，避免接手者誤以為已結案）
- 新幹線：使用者 2026-11-03 說「票我自己訂」，Muse 的訂票跟進已結束；使用者選的是 2026-11-26（週四）Hayabusa 51 東京 06:56 → 新青森 10:07、普通車指定席 1 人，Muse 沒有確認為已訂票，不要重試訂票、不要催 eki-net 密碼。
- 青森住宿：不二やホテル（Fujiya Hotel）預約編號 10470，2026-11-27（週五）1 晚、1 房 1 位男性、和室、含早晚餐、總價 ¥22,467 現場支付、入住 15:00／退房 10:00；11-26 抵達新青森 10:07 到 11-27 入住之間，11-26 夜的住宿沒有來源覆蓋，使用者可能已有其他安排，提問時只問一次、若已覆蓋就不要再追。
- PayPay Card：2026-11-03 的利用可能枠增額審查被拒（綜合判斷、理由不公開、現行額度未知、只能在 PayPay App 查），已交付過、不要重送、不要把此事與新幹線付款連結、不要建議申訴。
- 本節僅為簡述，避免接手者誤以為上述事項已結案；上述事項的完整細節不在本文件範圍內，接手者不得憑空補細節，須以原始對話／記憶檔為準（本文件不以「回頭查對話」作為完整脈絡的替代，§1.6 的簡述本身就是已知缺口）。

---

## 1.7 現況 vs 研究建議對照表（必讀：以下研究是建議，不是現況）

> **閱讀規則（審查後補上，草稿原本缺少這段，導致現況與建議被混讀）：以下研究報告全文是 2026-11-03 的建議方向，不是已經實作的現況。凡是與 §1.1–§1.6 數值、定義或架構衝突的地方，一律視為「待決策」，不得直接覆蓋 §1，也不得直接當成開發規格實作。研究內文的 § 號（如 §3.5、§2.7）皆指研究報告內部編號，與本文件 §1.x 無關。**

### 1.7.1 術語對照表

| 本文件 §1 用語 | 研究用語 | 注意 |
|---|---|---|
| 動 | Movement | 舊制是分級計分（保底 30／主課表 50／加一輪 60）；研究建議改為二元勾選（有動即計），見下表 |
| 眠 | Sleep | 舊制是起床／熄燈／時長三段梯度計分；研究建議改為就寢／起床時間＋品質 1–5，扁平 5 XP |
| 探 | Explore | P1 鎖定，程式碼中 XP 實際為 0；研究假設自第一天可用，見下表 |
| 連續 | streak／current run | 舊制連續＝訓練日；研究「current run」與「days active in last 28」是兩個不同數字，不得混為一個「連續」 |
| 達標率 | adherence | 研究 §2.7 的 adherence＝完成／計畫，與新連續（任一支柱即計）不同，睡覺日會延長連續卻不提升 adherence |
| 健身房／居家 | gym／home | 研究的 gym 指商業健身房上／下肢訓練，home 指 daily-ten 居家徒手訓練 |
| 課表／模板 | session／template | 研究的 Upper A／B、Lower A／B 是研究新增的建議模板，不是 reel 原課表 |
| 完美日 | Perfect Day | 見下表，三種定義並存，必須先選一種 |

### 1.7.2 現況 vs 研究建議對照表

| 項目 | 現況（§1，已實作／已交付） | 研究建議（以下研究全文，未實作） | 衝突與決策狀態 |
|---|---|---|---|
| XP 總量與等級 | 每支柱上限 60 XP；動 30／50／60、眠梯度計分、Perfect Day +30 進 bonus；等級增量 200＋50×（當前等級−1），累計門檻逐級累加；XP 由紀錄衍生、不累積儲存，調低 XP 會讓總 XP 倒退（d6／d14） | 支柱每日最多 20 XP（動 10＋眠 5＋探 5，原文為 e.g. 舉例）、Perfect Day +10、PR +5（上限 1／天）；等級若保留，僅為裝飾標籤、不鎖內容 | **Blocking 待決策**：直接套用封頂制，舊總 XP 會被追溯重算而倒退，等級也會掉級，且每日 XP 從最高約 150（探索鎖定時）降到最高 35，升級速度變慢數倍。研究沒有 grandfather、凍結舊總分、另開新幣或重置告知的遷移方案。研究 §2.3 同時禁「XP loss」，與封頂制套用到既有用戶的結果自相矛盾，除非限定「僅適用新用戶／新幣」。在遷移方案決定前，不得實作封頂制。 |
| PR 是否帶 XP | PR #28 刻意設計：新 PR 是衍生、非 XP 的徽章／文案，既有 XP 與等級曲線不變（d16） | 研究 §3.5：PR +5 XP（上限 1／天），並稱其為 informational | **Blocking 待決策**：採用 PR +5 即廢止 d16，且同一天第 2 個 PR 拿 0 XP、以及 PR XP 本身就是 Deci 式預期任務相依獎勵，與「非控制性」主張衝突。須由使用者明示是否廢止 d16，否則 PR 維持非 XP。 |
| Perfect Day | P1：所有已解鎖支柱（探索鎖定時實際為動＋眠）；PR #28 的 Perfect Day 連續日＝P1 下動＋眠都到齊 | 研究：動＋眠＋探三支柱，稱「Unified, unchanged」；休息日以睡眠＋探索＋散步也可達成 | **Blocking 待決策**：三種定義不同，且「unchanged」在拼貼後是事實錯誤（舊制不需探索、新制必須探索；舊制需訓練、新制散步即可）。探索鎖定期，研究版 Perfect Day 無法達成，或暫以動＋眠計，二選一待定；P2 解鎖條件（14 天內 10 次起床）是否作廢也待定。 |
| 連續與寬容機制 | 連續＝訓練日；Freeze：每 7 個實際訓練日得 1 個、最多 2 個、自動補缺口、凍結日不計入；回歸任務：中斷後徽章＋3 天內 2 支柱日 ×1.5 | 寬容連續：Rest／Sick／Travel（研究 §2.2 另提 Break，後文消失）暫停時鐘、不歸零，並顯示 current run＋28 天活動天數；暫停日、28 天分母、暫停是否可同時拿 Perfect Day 皆未定義 | **Blocking 待決策**：Freeze 在研究全文出現 0 次，舊餘額去向不明；Freeze 與暫停並存會造成同一缺席日同時消耗 Freeze 又觸發暫停的重複保護。建議二選一（暫停取代 Freeze，舊餘額作廢／轉換待定），不得並存實作。另須定義：暫停需結束日或手動恢復、暫停日不計 Perfect Day／不計連續、28 天分母是否排除暫停日。 |
| 連續的定義放寬 | 連續只算訓練日；PR #28 里程碑（3、7、14、21、30、60、90、180、365 天）以訓練日為門檻 | 連續日＝任一支柱行動即計（只記一次睡眠也算） | **Blocking 待決策**：放寬後同樣天數變得容易得多，PR #28 里程碑門檻須重新校準，否則門檻失真；且 adherence 與新連續會分歧，須說明對外顯示的「連續」是哪一個數字。 |
| 睡眠模型 | 三段梯度計分（見 §1.3 修正後段落） | 就寢／起床時間＋品質 1–5，扁平 5 XP；PWA 睡眠必須手動（<10 秒） | **Major 待決策**：舊睡眠紀錄如何轉換、梯度是否作廢未提；研究同時說手動是 PWA 限制、又把手動 vs 原生列為開放問題 Q4，屬於半決定狀態。Phase 0 須先做睡眠模型決策，Phase 2 的「更豐富手動記錄」不得超過 10 秒承諾，否則不做。 |
| 資料模型與儲存原則 | XP、連續、Freeze 皆由紀錄衍生、不寫入欄位；PR #28 的 `rewards.js` 也是純函式、無儲存 | 研究 §3.6：`User.xp_total`、`StreakState.current_run_days`、本週／4 週健身房次數等皆為儲存欄位；`Day.perfect_day bool (derived)` 又存又衍生 | **Blocking 待決策**：儲存的衍生值會與重算值漂移（SetLog 更正後，`xp_total`／連續／本週次數的重算觸發未寫），且 Phase 0 又說 Perfect Day 為衍生狀態，與 §3.6 的儲存 bool 方向相反。二選一：沿用衍生制（刪 `xp_total` 等儲存欄），或改儲存制＋重算觸發規則。同步規則亦須二選一：`last-write-wins` 與「已完成 session 永不被覆寫」在已完成後又被舊裝置改寫時打架，須寫死優先規則與衝突副本處理。 |
| 一天一個主要訓練 vs 每週訓練量 | daily-ten 每日訓練；reel 增肌計畫每週 4 練（週一上肢、週二下肢、週四上肢、週五下肢，週三／週六日休息） | 研究：一天一個主要訓練（primary，暗示可有次要）；同一天做居家＋健身房只計一次 Movement；Today 線框同時有 Start＋home instead＋Rest 三個動作 | **Major 待釐清**：「一個視覺主按鈕」不等於「一天只能一個 Start」。須改寫為：每天僅一個主課；第二課若做，不重複計 Movement，Today 不主推。休息日文案「Rest day — recovery is training」本身無數字／名字／日期，按研究自己的具體性測試應刪除或補上使用者數據（例如下次課表與日期）。 |
| 訓練排程：固定星期 vs 順序制 | reel：固定星期制，週四／週五是否與週一／週二完全相同未確認 | 研究：順序制 Upper A → Lower A → Upper B → Lower B，不固定星期；建議日例如 Mon／Tue／Thu／Fri；家裡填補空檔（無健身房的日子預設居家課） | **Blocking 待決策（研究內部亦自相矛盾）**：研究 §3.4 範例寫「週一 Upper A 已做、週二 Lower A 漏掉，週三仍是 Lower A」，按「漏掉即跳過」應是週三 Upper B，範例等於「保留漏掉的課」，與「skipped」相反；且「漏掉跳過」與「改居家保留序位」是兩種相反規則，結果上都是「當天沒做健身房課」，區分標準（有無點按鈕）未說明為有意設計。接手者必須先二選一（建議：無論漏掉或改居家，序位皆保留，僅不補做雙倍），並修正範例，不得同時實作兩種規則。另：A／B 區分非 reel 內容，是研究新增建議；reel 原課表僅有上肢／下肢各一種。 |
| 休息日是否存在 | reel：週三、週六、日共 3 天休息 | 研究：Mon／Tue／Thu／Fri 健身房＋其餘 3 天預設居家課＝每週 7 天活動，同時又保留「休息日」畫面 | **Blocking 待決策**：4 gym＋3 home 僅為假設，未定；休息日須有明確產生規則（例如每週至少 1 天系統排休），否則不得稱有休息日。研究 §4.5 Q7 自己承認 §3 已先假設 4＋3，卻又列為待確認。 |
| 課表內容與次數範圍 | reel 上肢 7 動作各 2 組共 14 組、下肢 6 動作各 2–3 組共 12–18 組；充實建議：複合 6–10、孤立 10–15；reel 強調練到力竭，充實建議主張多數組保留 1–2 下餘力、力竭只偶爾用在安全器械孤立動作最後一組 | 研究 Upper A：bench、row、overhead press、pulldown、curl、tricep（6 動作）；Lower A：squat、hinge、leg press／hack、leg curl、calf（5 動作）；次數：複合 6–8、孤立 8–12；研究 §4.4 主張 RIR 1–2 | **Major 待決策**：研究模板掉了側平舉與第二個臥推、內收肌與腿前伸展，多了 reel 沒有的肩推；次數範圍也縮小。兩套課表不得同時當成定案，須標示研究模板為建議草案、以教練驗證版為準，reel 版僅供對照；力竭 vs RIR 的取捨亦須由教練驗證決定，路線圖不得預設採納其中一方。 |
| 週目標分母 | PR #28：週一到週日 5 個 Perfect Day，首頁顯示「本週 Perfect Day X/5 天」 | 研究線框：本週 3／4 健身房、5／7 天活動；另有健身房達標率（x／4 週）與居家每週次數 | **Major 待釐清**：三個分母並存，草稿未說週目標是否保留、被取代，還是三個數字同時顯示。須決定首頁顯示哪幾個進度條及其關係，不得讓接手者自行猜測。 |
| 家／健身房分開計分 | PR #28：新 PR 偵測分 HRP／Plank／兩英里跑，加練算 PR 但不計課表 XP | 研究：PR 儲存在同一張表＋`mode` 欄位、顯示時按模式分組；量／負荷趨勢僅健身房；居家只計次數／分鐘，不併入健身房噸數；進步規則不共用（健身房雙重漸進 vs 居家 AFT 式 4–6 週重測） | **Major 待釐清**：研究 §3.5 表頭寫「Separate stores」，正文寫「same PR table」，須統一為「同一張表＋mode 欄位，顯示與計分分開」，不得誤讀為建兩張表或合併計分。另：`ProgressionState` 僅適用健身房雙重漸進，居家重測週期須另設欄位／流程，不得共用同一 suggestion 欄位；HRP（hand-release push-up）與研究版 push-up max 是否同一指標須明示，否則分開存。最小課／散步的防刷分主張亦不成立：研究給最小課、散步、完整健身房課相同的 Movement 10 XP 與 Perfect Day 資格，比舊制分級（30＜50＜60）更容易刷分；須二選一：最小課／散步計 Movement 但不計 Perfect Day，或最小課 XP 減半，不得同時宣稱防刷分又給同分。 |
| 探索解鎖與等級門檻 | 探索 P1 鎖定（`explore.open = false`；P2 需 14 天內 10 次起床）；等級為數值門檻 | 研究：等級若保留僅為裝飾標籤、永不鎖內容；Today 第一天就有 Explore 可勾 | **Major 待決策**：研究方案假設探索自第一天可用，若採用，P1／P2 鎖定條件即作廢，須明示；等級門檻作廢與否亦須明示。 |
| 暫停狀態的名稱與數量 | （現況無 Rest／Sick／Travel 暫停狀態，只有 Freeze） | 研究 §2.2：Rest／Sick／Break／Travel 四種；§3.4／§3.6：Rest／Sick／Travel 三種，Break 消失 | **Major 待統一**：須統一為一張狀態表，寫明 Break 是否併入 Rest；且「休息日（可計分）」與「暫停狀態（凍結計時）」不得只寫 Rest 混用，須用不同詞區分。 |
| 模式預設 | （現況無 Home／Gym／Mixed 模式設定） | 研究：模式選項標示 Mixed（recommended），同時又說新使用者預設 Home | **Minor 待統一**：須改為「新使用者預設 Home；當使用者標記已加入健身房時，建議切換 Mixed」，並刪掉無條件的 (recommended) 標籤。 |
| 同步與資料來源 | daily-ten：PWA、本地衍生計算；Vercel 介面：localStorage（key `fahhh-training-v1`），不跨裝置同步 | 研究：IndexedDB 為主、前景同步、上傳未同步列、伺服器副本、刪帳號即刪伺服器副本 | **Major 待決策**：Vercel 介面去留未定（退役＋資料匯入 daily-ten／凍結為唯讀／明確平行但分工，三選一），且兩個 local-only 系統並存會讓換手機時兩邊都丟資料。路線圖在 Q5（單機 vs 雲端）決定前，§3.6 同步段落視為草案不實作；Phase 0 的刪帳號須移到 Q5 決定之後（現況 PWA 為無帳號設計，刪帳號預設了帳號／後端存在）。 |

### 1.7.3 交付前決策門（以下任一門未過，不得按研究路線圖開工）

1. **PR #28 與 XP 遷移門**：PR #28 是否合併？封頂 XP 是否採用？若採用，舊 XP 是凍結為歷史標籤、新制另起，還是只適用新用戶？在答案出來前，Phase 0 不開工。
2. **Freeze vs 暫停門**：二選一或合併規則＋舊餘額轉換方案。
3. **順序制規則門**：漏掉與改居家是否都保留序位、僅不補做雙倍？修正 §3.4 範例後才可實作順序引擎。
4. **Perfect Day 過渡門**：探索鎖定期 Perfect Day 算 2 支柱還是永遠拿不到？P2 條件作廢與否？
5. **PR XP 門**：是否廢止 d16？若不廢止，PR 維持非 XP，研究 §3.5 的 PR +5 不得實作。
6. **儲存 vs 衍生門**：沿用衍生制或改儲存制＋重算觸發規則？`perfect_day` 不存欄位、每次衍生，或存欄位＋每次支柱寫入即重算，二選一。
7. **模板與安全門**：Upper／Lower A／B 內容、次數範圍、起始負荷、力竭 vs RIR、疼痛旗標（`pain_flag`＋`progression_hold`）與起始負荷規則，須經教練驗證簽核後才進開發；B 模板差異化方案不得由工程順手寫。
8. **Vercel 與現況功能處置門**：Vercel 介面三選一；現況功能處置表（語音導引、Boss Day、星期課表、回歸 ×1.5、慶祝卡／`game.seen`、三環 UI、≥30 成就收藏計畫、PR #28 里程碑徽章）每項標保留／改版／刪除／待定，否則 Today 重建會默默刪功能。

---

# Daily-Ten Habit App — Deep Product Research

**Date researched:** 3 November 2026 (web index; no sign-in, no live account checks)
**Confidence note:** Prices and feature lists come largely from 2026 comparison roundups and vendor listings, not from hands-on testing of every app. Where a claim rests on one secondary roundup it is flagged. Peer-reviewed habit science (Lally, Gollwitzer & Sheeran) is the strongest evidence in this report; retention percentages from vendors are directional only.

## Summary — the recommended direction in one paragraph

**Redefine daily-ten as: “One day, one clear training action — home or gym — plus sleep and exploration, judged by consistency, not perfection.”** Keep the PWA, keep three pillars and Perfect Day, but demote XP/streaks from punishers to *informational* records, add a single gym mode that is a second training *session type* inside the same day (not a second app), and ship nothing that does not reduce the time from opening the app to starting the workout. The MVP is: unified Today view + sequence-based Upper/Lower A/B logging with last-session numbers and double-progression prompts + forgiving streaks + local-first data with CSV/JSON export. Defer social feeds, AI coaching/content generation, nutrition, wearables sync, and a native app until the core loop retains users for 4+ weeks.

---

## 1. Leading apps for exercise & self-growth habits

### 1.1 Comparison table

| App | Type / best for | What it does well (concrete) | What it does badly / friction | Pricing (2026 roundups, verify before quoting) | Platforms / offline / sync |
|---|---|---|---|---|---|
| **Streaks** | Simple habit tracker, Apple users | 3-second check-in: tap a ring, done. Up to 24 habits, flexible schedules (daily, x/week, chosen days). Reminders only if not yet done, timed around usual completion. Auto-completes from 80+ Apple Health types (steps, workouts, sleep, water). Widgets, Watch complications, Siri/Shortcuts, no account, no ads/tracking. | Apple-only — no Android, no web. Hard streak reset is the risk: a miss reads as failure (see §2). Cap of 24 habits; no deep analytics, no strength logging. | $5.99 one-time, Family Sharing | iOS/iPad/Mac/Watch/Vision Pro; iCloud sync; offline, syncs when back online |
| **Loop Habit Tracker** | Free, private habit tracker, Android | Free, open-source, no ads. “Habit strength” score dips on a miss instead of resetting to zero — the most forgiving streak model in this set. Charts, widgets, flexible frequencies. All data on device. | Android only. No timer/routine runner, no cross-device cloud sync, no coaching, plain UI. | Free | Android only; local/offline |
| **Habitica** | Gamified habits/tasks | Full product free: Habits + Dailies + To-Dos earn XP/gold, avatar levels, parties/guilds/boss fights create real social accountability (skipping hurts the party). Cross-platform. | The cautionary tale for daily-ten: busy UI, shallow RPG that bores gamers and confuses non-gamers, iOS lag/crashes, reviews citing bugs breaking streaks/notifications, gamification getting in the way of simple tracking. Limited advanced stats; offline weak. | Free; Premium $4.99/mo or ~$48/yr cosmetic/QoL only | iOS/Android/web; cloud sync |
| **Habitify** | Cross-device stats tracker | Charts across devices, reminders, sync everywhere; good for data-minded users with few habits. | Free plan narrowed to 3 habits (reported Apr 2026); paid tiers jump to $29.99/yr Plus / from $8.99/mo Pro in some listings — pricing confusion is itself friction. | Free (3 habits); Plus ~$29.99/yr | iOS/Android/web/Mac |
| **Finch** | Gentle self-care | Virtual pet grows from small actions (breathing, journal, mood check-in); no punishment for missing a day. Free tier unusually generous (journal, mood/goals, core exercises, no ads). Resonates with ADHD/anxiety users who quit clinical apps. | Reward can flatten into “do it for the coins” (overjustification, §2); friends quit when pet novelty wears off. Dense first-run interface; iOS/Android Plus price gap is the most-cited complaint. Journal/check-ins work offline, sync/customisation need connection. Not a strength tracker. | Free; Plus ~$9.99/mo or ~$69.99/yr (platform prices differ) | iOS/Android |
| **Fabulous** | Guided routine coaching | Guided onboarding; one behavioural-science “Journey” at a time gives vague goals shape; large audio-coaching library, breathing, journaling, challenges, optional human coaching. Duke behavioural-economics-lab lineage. | The bloat archetype: “a lot of app” — users leave for less coaching/more tracking, a routine that runs itself, or gentler tone. One-Journey-at-a-time boxes in users whose goals don't fit one track; no interface customisation; persistent upsells; busy animation-heavy UI adds taps before check-in; thin long-term analytics. Trustpilot 3.2/5 (3,936 reviews) vs App Store 4.4 in Sept 2026 check. | Free download; Premium annual $49.99, quarterly $39.99 (US App Store, Oct 2026; prices vary by country, 10 IAPs $16.99–$59.99) | iOS/Android |
| **Hevy** | Strength log (gym) | Fastest “see last session, beat it” loop: a set is a couple of taps, last numbers visible. Unlimited workouts free, PRs, estimated 1RM, volume trends, per-muscle heatmap, plate calculator, rest timer, supersets. Social feed folds away entirely if unwanted. Strong CSV import; workout/measurement CSV export. | Progression is manual — it tracks but does not choose next weight (Hevy Trainer, Pro, does). Best analytics/programming behind Pro; free tier caps routines (4) and stats history (3 months in some comparisons). | Free; Pro $2.99–$4.99/mo, $23.99/yr, $74.99 lifetime (sources vary by region/date — verify) | iOS/Android/Watch/Wear OS/web |
| **Strong** | Strength log (purist) | Plainest logger, no social feed, fastest logging, clean PR graphs, 1RM calculator, plate/warm-up calculators (Pro). Free tier: unlimited workouts, 3 templates, never locks your log. CSV export. 4.9★, 109k App Store ratings (Oct 2026 check). | No plan generation, no social, volume-per-muscle analytics less detailed than Hevy, charts/measurements Pro-gated, cannot re-import its own CSV cleanly. | Free (3 routines); Pro $4.99/mo, $29.99/yr, $99.99 lifetime | iOS/Android/Watch |
| **Fitbod** | Auto-programmed gym | Generates each session from history + recovery + equipment; auto-adjusts weights — genuine progressive-overload programming, not just logging. Best for users who don't want to program. | Subscription-only, highest price in class (~$12.99–$15.99/mo, ~$80–$96/yr, 7-day trial only — listings disagree). Intrusive for lifters who already know their program; strength-only, not cardio/habit/sleep. | Trial only, then ~$95.99/yr (Sept 2026) | iOS/Android |
| **Nike Training Club (NTC)** | Free guided home workouts | Entire library free: plans, 300+ workouts, bodyweight/minimal-equipment, trainer-led strength/mobility/yoga. Best free on-ramp; no paywall excuse. | No strength-progression/PR tracking (logs, does not coach/programme); catalogue grows slowly; no community layer. Variety without guidance can overwhelm. | Free | iOS/Android; needs internet for video in older reviews |
| **Freeletics** | Bodyweight/HIIT coach | Closest commercial analogue to daily-ten's home mode: AI coach adapts bodyweight session to last-session feedback, no equipment, small space. One subscription covers bodyweight/running/gym coaches; community feed. | Famously demanding intensity — poor scaling honesty risks injury/dropout for beginners. Full benefit requires Coach (~$34.99/3mo; other listings $12.99–$17.99/mo). Limited gym-style variety; no live classes. | Free tier; Coach subscription | iOS/Android |
| **Apple Fitness+** | Premium guided, Apple ecosystem | Best production quality; live Watch metrics on screen (HR/calories) during workouts; wide variety; good value inside Apple One. | Requires Apple Watch for full experience; no Android; less AI personalisation than Fitbod/Freeletics; no PR/progression system. | $9.99/mo | iOS/Watch only |
| **Gentler Streak** | Recovery-aware activity | The anti-guilt model daily-ten should copy: Activity Path / “go zone” from HRV, resting HR, sleep and load; statuses Active / Break / Sick / Injured do **not** break the streak; rest framed as training. Apple Watch App of the Year 2022, Design Award 2024, calm design. | Apple-only, Watch required for best features; not a programme teacher (optimises an existing routine, doesn't teach lifts); needs 2–3 weeks to personalise; some miss laps/intervals/custom sessions. Can feel “too gentle” if progression is the goal. | Free tier; Premium $8.99/mo or $39.99/yr | iOS/Watch |
| **WHOOP / Strava (context, not direct rivals)** | Recovery / social endurance | WHOOP: Recovery 0–100%, Strain 0–21, sleep stages/debt, 140+ journal behaviours — the pillar model done with sensors. Strava: largest social endurance community, best GPS. | WHOOP: subscription + band cost, no screen, automated AI insights feel impersonal to some; HRV does **not** flow through Apple Health to third parties (only via direct API, e.g. TrainingPeaks). Strava: key features paywalled; social comparison can shame. Lesson: don't try to out-sensor them from a PWA — see §2/§4. | WHOOP subscription + hardware; Strava free + Premium | Wearable-dependent |

**Onboarding, daily loop, reminders — cross-app pattern:** Winners show value in session one and ask questions later. Streaks: pick icon → frequency → done, no account. Losers front-load 5+ screens (account, questionnaire, paywall, friend invites) before any actionable step — one analysis cites >4 required onboarding steps sharply raising Day-2 abandonment (secondary source, treat as directional). Routinery is the counter-example worth stealing from: instead of a grid to grade, it *runs* the routine on a timer — relevant if daily-ten's home session ever feels like a checklist rather than a workout.

**Social:** Only Habitica (parties) and Hevy/Strava (opt-in feeds) show social helping; in every case it helps when it is *opt-in and foldable away*, and hurts when it is a leaderboard/shame mechanic or a default feed. Daily-ten should not ship social in MVP.

**Pricing lesson:** The market splits into (a) pay-once/free-core (Streaks $5.99, Loop free, Habitica free-core, Hevy generous free) which users trust, and (b) subscription-everything (Fitbod, Fabulous, Finch Plus) which users resent when the free tier is a demo. A PWA with no store billing has an advantage here: don't invent a subscription to fund features nobody asked for.

### 1.2 What users report as abandonment causes (synthesis, not a single study)

- **Choice paralysis:** a 500-video library is now a liability, not a selling point; users spend 5 minutes deciding and lose momentum. Successful apps give *one* next session.
- **Manual-logging friction:** every extra tap/field at the moment of lowest willpower (tired, post-work) taxes the habit; the Day-30 cliff is steepest for manual-logging apps. Vendor figures vary wildly (health/fitness retention ~3% by Day 30 in one AppsFlyer summary, ~8% in Adjust, 12% by Day 14 in Airship; a 2024 JMIR scoping review found median 70% discontinuation within 100 days) — **do not quote any single percentage as fact; the shape (steep early drop, then flattening) is the robust finding.**
- **Streak-break shame:** see §2 — the break, not the miss, kills the habit.
- **Generic advice:** unpersonalised content feels like filler; users delete rather than configure.

---

## 2. What makes a good app in this category — a standard

### 2.1 Well-supported (peer-reviewed or strongly replicated)

1. **Repetition in a stable context creates automaticity; perfection does not.** Lally et al. (2010, n=96, 12 weeks): median ~66 days to 95% of automaticity plateau, **range 18–254 days**; a single missed day did not materially affect the curve. A 2024 systematic review (20 studies, 2,601 participants) found medians of 59–66 days where time was reported, but 11/20 studies were high risk of bias — so **never promise “66 days” or “21 days”** (21 days has no basis). *Design consequence:* show a calendar/heatmap of *rate over the last 28 days*, not a single brittle number; a miss is a light square, not a reset.
2. **If–then plans work.** Gollwitzer & Sheeran (2006) meta-analysis: 94 tests, 8,000+ participants, **d = 0.65 (medium-to-large)** for implementation intentions (“After coffee, I will do the 10-minute home session”). Habit stacking is this effect with an existing habit as the cue — the science is Gollwitzer's, the name is Clear/Scott popularisation. *Design consequence:* onboarding ends with one sentence the user writes: “After [anchor], I will [session] in [place].” Store it, show it on Today, don't ask again.
3. **Small minimums survive.** Tiny Habits / Fogg logic, consistent with Lally (simple behaviours automated faster than complex ones like 50 sit-ups): a 2-minute / one-set minimum on a bad day beats a skipped 45-minute session. *Design consequence:* every session has a **Minimum Viable Session** (e.g. warm-up + first exercise, or one set per lift) that still counts — but see XP rule in §3 so the minimum can't be gamed into the whole programme.
4. **Immediate, meaningful feedback beats delayed outcomes.** The cue→craving→response→reward loop is a simplification, but the replicated parts are: specific cues beat vague ones, immediate rewards reinforce more than distant weigh-ins/PRs months away. *Design consequence:* feedback at set completion (last vs today, “+2 reps vs 12 Nov”), not only at week/month end.
5. **Gamification helps a little, then fades — and controlling rewards can backfire.** Gamified physical-activity interventions: **g = 0.42, shrinking to g = 0.15 at 12–24-week follow-up** (RCT meta-analysis cited in 2026 synthesis). Deci, Koestner & Ryan (1999, 128 studies): expected, tangible, task-contingent rewards undermine intrinsic motivation (overjustification effect, d ≈ −0.36 for completion-contingent rewards). Loss aversion (losses feel ~2× gains, Kahneman & Tversky) is why streaks grip — and why a reset feels like punishment. *Design consequence:* XP/badges must be **informational** (“you trained 3× this week; bench 60kg × 8 is a PR”), never controlling (“do it or lose everything”); no pay-to-restore-streak, no damage/health-loss metaphor, no leaderboard by default.
6. **Specific, concrete goals beat vague intentions** (Locke & Latham goal-setting literature, via secondary summaries). *Design consequence:* “Upper A, 5 lifts, beat last week's top set” beats “get stronger.”

### 2.2 Opinion / product judgement (labelled as such — plausible, not proven)

- **One primary action per screen.** The most repeated practitioner rule in retention writing; no RCT proves “one action” universally, but it is the consistent explanation for why Streaks/Hevy retain and Fabulous-style dashboards lose people. Adopt as a design constraint, test with real users.
- **Motivation without punishment = Gentler Streak's model generalised:** Rest / Sick / Break / Travel statuses pause the streak clock without erasing history; a “recovery within 48 hours” nudge replaces a guilt notification. This is *inferred* from Gentler Streak user reports and Lally, not from a trial of daily-ten.
- **Personalisation vs complexity trade-off:** personalise *only* what changes tomorrow's session (next lifts + loads, sleep target, today's minimum) — not themes, avatars, quote feeds, or 20 settings. Every personalisation question asked at onboarding must earn its place by changing the first session.

### 2.3 The standard — keep / cut

| Keep | Cut / refuse |
|---|---|
| One Today screen: today's session (or rest), sleep check, exploration check, one Start button | Dashboards with 6+ cards, charts on the home screen, feeds, leaderboards |
| Last-session numbers pre-filled; one-tap set logging; rest timer | Free-text workout builders, exercise libraries browsable from Today (library lives one tap *inside* a session, for swaps only) |
| Forgiving streak + 28-day adherence % + PR list | Streak reset to zero, XP loss, “you're behind X% of users”, red failure states |
| One reminder, user-timed, only if not done; snooze, not nag | Multiple daily pushes, streak-threat notifications (“Don't lose your 47 days!”) |
| Local-first data, one-tap CSV/JSON export, clear delete | Cloud lock-in, export-by-email-request-only, analytics SDKs the user can't see |
| Human-written, countable content: named sessions, named lifts, real numbers | AI-generated motivational quotes, daily AI “insights” with no source data, generic workout text |
| WCAG 2.1 AA: 4.5:1 contrast, 44pt+ targets, Dynamic Type/text to 200%, Reduce Motion respected, no colour-only meaning, labelled controls for VoiceOver/TalkBack, pauseable timers | Auto-advancing timers with no pause, colour-only pass/fail, tiny tap targets in a sweaty gym |

### 2.4 Avoiding AI slop — concrete rules

“Slop” (Merriam-Webster word of the year 2025: low-quality AI content produced in large quantities) is now a trust cost, not just a taste issue: Capgemini found trust in AI-generated content fell **73% (2023) → 55% (2025)** across 13 countries; in visible-AI-marketing studies 31% trusted a brand *less* vs 7% *more*; ~50% of Gen Z have unfollowed/muted a brand for slop-like content (secondary summaries of Hootsuite/EMARKETER — directional, but the direction is consistent across sources). Rules for daily-ten:

1. **No generative content the user must read to act.** Sessions, progressions and tips are deterministic rules from the user's own log (e.g. “last time 60kg × 8, target 60kg × 9–10 or 62.5kg × 8”) — computable, checkable, never hallucinated.
2. **If AI is ever used, it drafts, a human rule verifies, and the user sees the source numbers.** No AI exercise prescription without a progression rule the user can inspect.
3. **Specificity is the anti-slop test:** every piece of text in the app must contain a number, a name, or a date from the user's data — or be deleted. Generic encouragement (“Crush it today!”) fails this test.
4. **No infinite content:** no daily quote feed, no generated articles, no “AI coach chat” in MVP. Scarcity of content is a feature.

### 2.5 Data ownership & sync — what “good” means for a PWA

- **Local-first:** IndexedDB is the source of truth; sync (if any backend exists) is a backup, not a gate. The app must work fully offline — gyms and homes have dead zones, and Strong/Hevy/Streaks all treat offline as table stakes.
- **Export from day one:** one-tap CSV (sessions/sets) + JSON (full backup incl. PRs, pillar history). Strong and Hevy both offer CSV export; Strong cannot re-import its own export — daily-ten should support *import of its own export* and, later, Strong/Hevy CSV import, so switching *in* is as easy as switching *out*. GDPR Art. 15/20 portability is the legal floor in the EU, not a premium feature.
- **PWA limits to design around (iOS, 2026):** push only if installed to Home Screen (since iOS 16.4, permission after a tap); **no Background Sync API on iOS** — sync on foreground open/focus/reconnect, never promise background upload; no install prompt on iOS (user must use Share → Add to Home Screen — so include a 2-step install guide, not a fake button); **no HealthKit, no Apple Watch app, no widgets, no Bluetooth** from a PWA. That means: sleep/movement cannot auto-import from Apple Health/Watch in a PWA — sleep must be manual (bedtime/wake + quality 1–5, <10 seconds) or explicitly deferred to a future native app. Do not market “wearable sync” the PWA cannot deliver.
- **Sync across devices:** if daily-ten stays PWA-only, honest sync = same account + foreground sync + conflict rule (last-write-wins per session, never silently overwrite a completed session). If that backend is not built, say so: “single-device + export backup” beats a broken sync that loses a PR.

### 2.6 Accessibility (non-negotiable, cheap if done early)

WCAG 2.1 AA as baseline: 4.5:1 text contrast (3:1 large text), reflow to 200% text without clipping, 44×44pt minimum targets (critical with sweaty hands in a gym), keyboard operability, screen-reader labels on every number (“Bench press, 60 kilograms, 8 reps” — not just “60 × 8”), `prefers-reduced-motion` respected (no confetti/shake on completion if reduced motion is on), no time limit on logging a set, pause/extend on every timer. Test with VoiceOver + largest Dynamic Type on every release — the cost of retrofitting charts that only communicate by colour is far higher than adding text alternatives now.

### 2.7 How to measure whether the habit is actually sticking (not vanity metrics)

Do **not** report streak length alone to the user or to yourselves. Report, weekly:

1. **Adherence (last 28 days):** sessions completed ÷ sessions planned (home + gym separately *and* combined — see §3). Target: trend, not 100%.
2. **Return rate:** % of misses followed by a session within 48 hours — the Lally-consistent metric; a rising return rate matters more than a long streak.
3. **Minimum-session use:** % of weeks where the minimum saved a week that would otherwise be zero — proves the minimum works.
4. **Progression:** PRs per 4 weeks (per lift), total weekly volume trend, and — for AFT-style home work — push-up/plank/run test results over time. If volume/PRs flatline for 4 weeks while adherence is high, the *programme* is wrong, not the user.
5. **Sleep consistency:** bedtime/wake variance + self-rated quality trend (manual, simple) vs training adherence — correlation to *show*, not to auto-prescribe from.
6. **Self-report automaticity (monthly, 1 question):** “Doing my session feels automatic” 1–5 — the Lally construct, cheap and honest. Do not over-interpret a single score.
7. **Product health:** Day-7 / Day-30 return, time-to-start (open → first set logged, target <30s), and % of sessions started from Today vs from deep navigation (if Today isn't the start point, Today is broken).

---

## 3. Integration: home bodyweight (daily-ten) + 4×/week gym Upper/Lower

### 3.1 The core insight

These are **not two programmes competing for the same day. They are two session types feeding one daily habit.** The home programme is *daily, short, general* (AFT-style readiness: push endurance, core, running/conditioning, done at home). The gym programme is *4×/week, long, specific* (hypertrophy/strength, needs equipment, needs a log). The failure mode to avoid is the one every all-in-one app hits: two home screens, two streaks, two XP currencies, and a user who must decide which app they are in today. The fix is: **one day, one primary session, two session engines underneath.**

Note on “AFT-style”: the current Army Fitness Test (renamed from ACFT in 2025, standing power throw removed) has **5 events: 3-rep-max deadlift, hand-release push-ups (2 min), sprint-drag-carry, plank, 2-mile run — 0–100 each, 60 minimum per event**. Home bodyweight training can directly train push-ups, plank and run analogues; deadlift and sprint-drag-carry need load/space and are *gym/field* work. Daily-ten should be honest about this split instead of claiming home-only AFT readiness — and the gym mode is precisely where deadlift-pattern work (hinge, squat) lives.

### 3.2 Proposed product structure

**Navigation: 3 tabs only.**

1. **Today** (default, everything) — see §3.3.
2. **Progress** — calendar/heatmap, PR list, volume trend, sleep trend. Read-only; no actions except export.
3. **Plan** — the week sequence, session templates (Home, Upper A/B, Lower A/B), exercise swaps, rest/sick/travel status, settings, export/delete. Editing lives here, never on Today.

No feed tab, no social tab, no shop tab, no “Discover” tab in MVP.

**Modes, not apps:** a single setting — *Training mode this week: Home / Gym / Mixed (recommended)* — plus a per-day override. Default for a new user is Home. A user who joins a gym flips to Mixed once; the app then sequences gym days into the week (see §3.4). There is no “switch apps” moment and no duplicate home screen.

### 3.3 The unified daily view (Today) — wireframe in words

```
Today — Tue 3 Nov
[Status chip: Gym day · Upper A]        [Rest/Sick/Travel →]

  TODAY'S SESSION — Upper A (45–60 min)
  Beat last time: Bench 60kg × 8 · Row 70kg × 8
  [▶ Start Upper A]   [Do home session instead]   [Rest today]

  ── Daily pillars ──
  ✓ Movement  (completes when any session finishes, or a walk logged)
  ○ Sleep     (last night: __:__ → __:__ · quality 1–5)
  ○ Explore   (one new / outdoor / learning action — free text, 1 line)

  Perfect Day: 2 of 3 — finish Sleep to complete it.
  This week: 3 of 4 gym sessions · 5 of 7 days active
```

Rules:

- **Exactly one Start button is visually primary.** The alternative (“home instead”, “rest”) is a quiet secondary link. The user never sees two equal “Start” buttons.
- **Pillars are checks, not workouts.** Sleep and Explore are 10-second logs. Movement is *derived*: finishing any session (home or gym) or logging a walk ticks Movement automatically. The user never ticks Movement manually after training — that double-entry is pure friction.
- **Perfect Day = all 3 pillars on one calendar day.** It is deliberately *not* “did the hardest workout”. A rest day with sleep + exploration + a walk can be a Perfect Day; a gym PR day without sleep cannot. This protects the pillar concept from being swallowed by gym volume.
- **On a rest day**, Today shows: “Rest day — recovery is training” + Sleep + Explore + optional walk, and the *next* session preview (tomorrow's Upper B) — no guilt copy, no red.
- **Minimum Viable Session** is offered inside the session screen, not on Today: “Short on time? Do the minimum (warm-up + main lift, ~15 min) — still counts as Movement, but not as a full gym session for the 4× count.” (See XP/counting rule below.)

### 3.4 How a user switches between home and gym days

**Sequence, not calendar dates.** Gym training follows a rotating sequence — Upper A → Lower A → Upper B → Lower B → repeat — not fixed weekdays. This is the single most important integration decision:

- If Monday is Upper A and Tuesday is missed, Wednesday is still Lower A (the *next* session), not a frantic catch-up double. Missed sessions are skipped in sequence, never stacked.
- The week planner (Plan tab) shows the sequence with suggested days (e.g. Mon/Tue/Thu/Fri) that the user can drag to other days; dragging changes the *suggestion*, not the sequence order.
- **Home days fill the gaps:** any day without a gym session defaults to the home daily-ten session. A gym day can be swapped to home in one tap (“Do home session instead” — sequence position is *kept*, so the next gym day is still the session you didn't do). A home day can be upgraded to gym if the user goes to the gym unexpectedly (“Train at gym today” → offers the next sequence session).
- **Deload / travel / sick:** one status toggle (Rest / Sick / Travel) pauses the gym sequence *and* the streak clock (Gentler Streak model) without erasing history. Returning resumes the sequence where it stopped.
- **Beginner guardrail:** first 2 gym weeks are “learn the lifts” — same sequence, lower volume (2 working sets/lift), no PR pressure copy. The app must not throw a 7-lift, 60-minute session at a first-time gym user on day one.

**Upper/Lower content (concrete template, to be validated by a coach, not invented as medical advice):** each session = 1 main compound (tracked hardest for PRs) + 2–3 assistance + 1–2 isolation, e.g. Upper A: bench, row, overhead press, pulldown, curl, tricep; Lower A: squat, hinge, leg press/hack, leg curl, calf. Double progression per lift: work in a rep range (e.g. 6–8 compounds, 8–12 assistance); when the top set hits the top of the range with 1–2 reps in reserve, add the smallest available load next session. The app *suggests* this next load from the log — it does not auto-increase without the user confirming after the set.

### 3.5 How streaks, XP and progress are shared — and where they stay separate

| Metric | Unified or separate? | Rule |
|---|---|---|
| **Daily streak / active days** | **Unified** | Counts a day if *any* pillar action or session is done. Uses forgiving rules: Sick/Rest/Travel days pause (don't break); a single miss does not reset — the streak display shows “current run” *and* “days active in last 28” side by side, so a break never wipes the story. Never show “0” in large red type after a miss; show “Last active: yesterday · 24 of last 28 days”. |
| **Perfect Day** | **Unified, unchanged** | All 3 pillars in one day, regardless of session type. One Movement credit per day maximum — a user who does both home + gym on one day gets one Movement tick, not two. This is the anti-double-counting rule. |
| **Gym adherence** | **Separate** | “3 of 4 sessions this week” + rolling 4-week adherence. A home session does *not* count toward the 4× gym count (otherwise the gym programme silently becomes home-only). A minimum session counts as Movement but *not* as a full gym session. |
| **Home consistency** | **Separate, light** | Home sessions per week (for Mixed users, this is “gap days filled”, not a second quota to fail). No separate home streak. |
| **XP** | **Unified currency, capped sources** | One XP pool, but: daily pillar XP is capped per day (e.g. Movement 10 + Sleep 5 + Explore 5 = max 20/day from pillars; Perfect Day bonus +10). Gym/home sessions award XP *only via the Movement pillar credit* (10) — **not** extra XP per set/lift — plus a small, separate “PR bonus” (+5 per new PR, max 1/day) that is informational. Rationale: per-set XP is exactly the controlling-reward grind that Habitica/Fapps show burns out; PR XP rewards *outcome quality*, not volume grinding. Levels, if kept, are cosmetic labels (“Week 4 · Consistent”), never gates that lock content. |
| **Progress / PRs** | **Separate stores, one Progress view** | Home PRs (push-up max in 2 min, plank time, 2-mile/run time, bodyweight reps) and gym PRs (load × reps per lift, estimated 1RM) live in the same PR table with a `mode` field, but are *displayed grouped by mode* — never merged into a single “strength score”. A home push-up PR and a bench PR are different adaptations; merging them into one number is the kind of fake unified metric users learn to distrust. |
| **Volume / load trend** | **Gym only** | Weekly sets per muscle group and top-set load trend are gym metrics. Home sessions contribute a simple count/minutes, not fake “volume” added to gym tonnage. |

**What explicitly must NOT be merged or added (do-not-merge list):**

1. Do not merge home and gym into one “workout score” or one combined streak that requires both.
2. Do not let gym volume buy Perfect Days or pillar XP beyond the daily cap.
3. Do not add nutrition/calorie tracking, meditation libraries, habit libraries beyond the 3 pillars, social feeds, challenges/leaderboards, or AI chat coaching to bridge the two modes — each is a second app hiding inside the first.
4. Do not auto-convert bodyweight reps into “equivalent kg” or gym loads into home difficulty — no fake equivalence.
5. Do not share progression rules: double progression (gym) and AFT-style test progression (home: timed push-up/plank/run retests every 4–6 weeks) are different systems; keep their UI copy separate.
6. Do not add a second currency (gems/coins) alongside XP.
7. Do not require the gym mode to unlock home features or vice versa — modes are equals.

### 3.6 Data model (minimum viable, local-first)

```
User { id, mode: home|gym|mixed, anchor: "after coffee…", status: active|rest|sick|travel, xp_total, created_at }
Day { date, user_id, sleep_bed, sleep_wake, sleep_quality 1-5, explore_text, perfect_day bool (derived) }
  — pillars are fields/derived on Day, not a separate gamified table; perfect_day is computed, never hand-edited.

SessionTemplate { id, mode: home|gym, key: home_daily | upper_a | upper_b | lower_a | lower_b,
                  name, estimated_minutes, min_version_exercise_ids[] }
TemplateExercise { template_id, exercise_id, order, target_sets, target_rep_range, rest_seconds, is_main_lift }

Exercise { id, name, mode: home|gym|both, muscle_groups[], equipment: none|barbell|dumbbell|machine|cable|kettlebell,
           home_variant_id (nullable: e.g. bench → push-up variant for swaps), instructions (human-written, short), video_url (nullable) }
  — one library, filtered by mode; a swap only offers same-muscle-group, same-equipment-available alternatives.

WorkoutSession { id, user_id, date, mode, template_key, status: planned|in_progress|completed|minimum|skipped|swapped_to_home,
                 started_at, ended_at, rpe 1-10 (optional), notes }
SetLog { id, session_id, exercise_id, set_no, is_warmup bool, load_kg (nullable for bodyweight), reps, rir (nullable),
         completed bool, created_at }
  — bodyweight sets store reps + variant; load is null, never 0-as-weight. Warm-ups excluded from volume/PRs.

PersonalRecord { id, user_id, exercise_id, metric: top_set_load | reps | time | estimated_1rm,
                 value, reps_at_value, session_id, date }
  — written only when a completed working set beats the previous PR for that exercise+metric; PRs are never edited by hand except via correcting the SetLog (which recomputes).

ProgressionState { user_id, exercise_id, current_load_kg, current_rep_target, last_session_id, next_suggested_load_kg, next_suggested_reps }
  — the double-progression suggestion engine: pure function of SetLogs; no ML, no black box.

WeekPlan { user_id, week_start, sequence_position (next template_key), suggested_days {upper_a: Mon, …} }
StreakState { user_id, current_run_days, paused_until (nullable), active_days_last_28 (derived), gym_sessions_this_week, gym_sessions_last_4w }
```

**Sync/conflict rules:** local IndexedDB first; each Session/SetLog has `updated_at` + UUID; foreground sync uploads unsynced rows and pulls newer rows; a completed session is never overwritten by an older planned row; export = dump of all tables as JSON + sessions/sets as CSV. Deleting the account deletes server copy and offers local export first.

---

## 4. Redefined direction & roadmap for daily-ten

### 4.1 Positioning (one sentence to test with users)

> “Daily-ten is the one-screen daily training habit: a short home session or your next gym session, plus sleep and one exploration — tracked by how often you return, not by a streak you can lose.”

If a proposed feature cannot be explained in that sentence, it does not ship in MVP.

### 4.2 Prioritised roadmap

**Phase 0 — Fix the core loop first (weeks 1–2, before any gym code).**
- [ ] Today screen rebuilt to §3.3 (one Start, pillars as 10-second checks, Perfect Day as derived state).
- [ ] Forgiving streak: pause statuses, 28-day adherence next to current run, no zero-reset shaming copy.
- [ ] Minimum Viable Session for home days; “After [anchor]” sentence captured once in onboarding.
- [ ] One reminder, user-timed, only-if-not-done; install-to-Home-Screen guide for iOS.
- [ ] Export (JSON + CSV) and delete-account; offline-first check (airplane-mode test of a full session).
- *Success gate:* 5 real users complete a full home session offline in <30s from open to first set; none can describe a “punishment” in the app.

**Phase 1 — MVP: gym mode as a second session type (weeks 3–6).**
- [ ] Exercise library (seed: ~30 lifts, human-written cues only) + Upper A/B, Lower A/B templates with main-lift flags.
- [ ] Sequence engine (next-session pointer, skip-not-stack, swap home↔gym in one tap, pause statuses).
- [ ] Set logging with last-session numbers pre-filled, rest timer (pausable), double-progression suggestion (“last 60×8 → try 60×9–10 or 62.5×8”), PR detection + PR list.
- [ ] Separate gym adherence (x/4 week) + unified daily/Perfect Day counting per §3.5; XP capped per §3.5 (or XP hidden behind a toggle if testing shows it distracts — see open questions).
- [ ] Progress tab: heatmap, PRs grouped by mode, volume trend (gym), sleep trend.
- *Success gate:* a Mixed user can do Mon gym / Tue home / Thu gym with zero navigation confusion in a think-aloud test; PRs survive export/import round-trip.

**Phase 2 — Harden, don't expand (weeks 7–10).**
- [ ] Accessibility pass (WCAG AA audit, VoiceOver, 200% text, Reduce Motion, 44pt targets), performance (PWA shell <2s on mid-range phone), PWA install/push reliability test on iOS + Android.
- [ ] Sleep as a slightly richer manual log only if users ask (consistency view); exploration prompts as a small *fixed, human-written* list (e.g. 20 prompts, no generation).
- [ ] Import Strong/Hevy CSV (read-only mapping, user confirms exercise matches).
- [ ] Measurement dashboard for yourselves (§2.7) — adherence, return rate, time-to-start.
- *Success gate:* Day-30 return and return-rate tracked for a cohort; no feature with <10% weekly use survives Phase 2.

**Defer (explicitly, with a reason):** social/feed/challenges (needs moderation + network effects daily-ten doesn't have); native iOS/Android + Watch/widgets/HealthKit sync (needed for auto sleep/activity, but a large rewrite — revisit only if manual sleep logging is the top complaint); nutrition; AI coach/chat; video libraries; custom programme builder (templates + swaps cover 90%); multi-user/family; payments/subscriptions (no paywall until core retention is proven — charging for a leaky bucket just monetises churn).

**Remove / simplify (if present in current daily-ten):** any second streak/XP currency; any leaderboard, damage, or loss copy; any AI-generated daily content feed; any tab/screen not reachable from Today in one tap that fewer than 1 in 5 testers use; any setting that doesn't change tomorrow's session (move to a single “Advanced” sheet or delete); any “Explore” implementation that is a content feed rather than a one-line user log (a feed turns a pillar into scrolling).

### 4.3 Anti-clutter principles (apply at every review)

1. **One primary action per screen; one Start per day.**
2. **New feature = old feature removed or a usage bar cleared** (ship it only if a named user problem needs it; count tabs — never exceed 3 in MVP).
3. **Data before decoration:** no chart, badge, or animation without a user-owned number behind it.
4. **The 30-second test:** open → Start → first set logged in <30s, on a phone, one-handed, offline.
5. **Forgiveness by default:** every destructive/negative state (miss, swap, pause) has a one-tap recovery and never erases history.
6. **Specificity test (§2.4):** text without a name, number, or date from the user's data is deleted.
7. **Fold-away rule:** anything social, competitive, or cosmetic defaults to off/hidden and is never on Today.

### 4.4 Risks

- **Programme safety:** upper/lower loads, double progression and AFT-style work are general information, not personal coaching. Add a plain-language disclaimer, conservative starting loads, RIR guidance (“stop 1–2 reps short of failure on compounds while learning”), and a prompt to seek qualified coaching/medical advice if in pain/injured. Do not auto-progress loads for users who report pain — capture a simple “pain / too hard / too easy” flag per session and *hold* progression on pain.
- **PWA ceiling:** if users demand Watch logging, widgets, or auto sleep import, the PWA cannot deliver it — this is a strategic fork to native, not a feature to fake. Decide early how much manual logging users will tolerate.
- **Gym-mode scope creep:** a programme builder, plate calculator, video form checks, and periodisation are each a product. The MVP deliberately stops at templates + swaps + double progression.
- **Gamification backlash:** XP/streaks may still demotivate a minority even when forgiving. Mitigate with an XP/streak *visibility toggle* (hide counts, keep calendar) — cheap insurance.
- **Retention measurement trap:** early cohorts are enthusiasts; Day-30 rates will flatter. Judge Phase 2 on a cold cohort, not friends-and-family.
- **Pricing trust:** roundup prices in §1 disagree across sources/regions (notably Fitbod, Hevy Pro, Finch Plus). Never quote a competitor price in-app or in marketing without a dated primary-source check.

### 4.5 Open questions needing user (owner) decisions

1. **Is XP kept at all, or hidden by default?** Evidence leans to informational-only or hidden; owner must choose, and test both with real users.
2. **Who is daily-ten for — AFT aspirants, general home trainers, or new gym lifters?** The AFT framing narrows the home programme (push/plank/run focus); a general audience wants broader movement. This changes template content, not architecture.
3. **What is “Exploration” concretely?** One line of user text? A fixed prompt list? An outdoor/walk/learning check? Currently underspecified — it must not become a content feed by accident.
4. **Sleep: manual only in PWA, or is a native app on the roadmap?** This decides whether sleep stays a 10-second check or becomes a real data pillar.
5. **Single-device + export vs cloud sync?** Cloud sync is real engineering + privacy responsibility; single-device is honest but loses users who switch phones. Owner must pick before Phase 1 backend work.
6. **Gym template authorship:** who writes/validates Upper/Lower A/B (coach review vs adapted public programme)? Do not ship unreviewed loads/rep schemes as if coached.
7. **Home↔gym balance in Mixed mode:** is the default 4 gym + 3 home, or does home shrink on gym weeks (e.g. home only on non-gym days)? The §3 model assumes home fills gaps — confirm this matches the owner's training philosophy and recovery expectations.

---

## Could not verify

- Hands-on UX of each app (no sign-in permitted; relied on listings/roundups/reviews). In-app onboarding flows, reminder reliability, and offline behaviour for Hevy/Strong/Fitbod/Fabulous/Finch are therefore second-hand.
- Exact current prices: listings disagree by region/date (Fitbod $12.99–$15.99/mo; Hevy Pro $2.99–$4.99/mo entry; Finch Plus iOS vs Android). Re-check primary store listings before any external use.
- Retention percentages: vendor reports use different definitions of “retained”; only the steep-early-drop shape is robust.
- Whether daily-ten's current codebase already has a backend/sync (mission describes it as a PWA only) — the data model in §3.6 assumes local-first + optional sync; adapt if a backend already exists.
- AFT scoring tables by age/gender/MOS: deliberately not reproduced here — if daily-ten scores AFT-style tests, source the current official tables, not roundups, and date-stamp them (standards changed in 2025–2026).

## Sources

- Habit trackers: https://rankite.com/blog/best-apps-for-habit-tracking
- https://blog.cohorty.app/the-ultimate-guide-to-habit-tracker-apps/
- https://www.roninreborn.com/blog/best-habit-tracker-apps.html
- Strength comparison (Sept 2026): https://www.jefit.com/blog/fitbod-vs-strong-vs-jefit-vs-hevy
- https://www.sensai.fit/blog/hevy-review-2026
- https://www.sensai.fit/blog/strong-app-review-2026
- https://getcurex.com/glp1-blog/top-apps-to-track-strength-progress
- Home workouts: https://rankite.com/blog/best-work-out-apps
- Streaks (primary listing): https://apps.apple.com/us/app/streaks/id963034692
- Habitica: https://productivity-apps.com/apps/habitica ; https://thedolceway.com/blog/habitica-app-review-gamify-productivity
- Fabulous: https://habitbox.app/blog/fabulous-app-review ; https://habitrewards.me/blog/fabulous-alternatives.html
- Finch: https://www.autonomous.ai/ourblog/finch-self-care-app-review-full-breakdown ; https://www.ixcoach.com/learn/finch-vs-fabulous-habits
- Gentler Streak: https://lifestack.ai/blog/gentler-streak ; https://dlsserve.com/gentler-streak-quieted-my-evil-brain-goblin-so-i-could-run-in-peace/
- Habit science: https://wildlymeasured.com/research/21-day-habit-myth/ ; https://www.longevityladder.com/subtopics/protocols/habit-formation/the-habit-timeline/the-66-day-median-honestly ; https://www.mentorandi.com/articles/habit-stacking.html ; https://daybra.in/blog/2026-04-12-science-of-habit-tracking.html
- Gamification: https://www.therr.app/blog/2026/8_25_2026_gamification_of_habits.html
- Retention/bloat: https://vocal.media/01/why-most-fitness-apps-lose-80-of-users-in-30-days ; https://hishanto95.medium.com/why-your-fitness-app-is-losing-users-86ec416ad8c1
- AI slop: https://blckalpaca.at/en/knowledge-base/social-media/ai-automation-social-media-management/ai-generated-content-engagement-ai-slop ; https://pasqualepillitteri.it/en/news/4378/smell-of-ai-why-trustworthy-sites-lose-trust
- PWA iOS: https://www.wavxsolutions.in/blog/pwa-on-ios-what-works ; https://blog.codercops.com/blog/progressive-web-apps-2026
- Upper/lower: https://loadmuscle.com/blog/upper-lower-split-guide ; https://www.boostcamp.app/users/8LHh5K-hypotrophy ; https://thegympro.co.uk/upper-lower-split-four-day-muscle-building-routine/
- AFT: https://www.militaryprephub.com/blog/army-fitness-test-aft-explained.html
- Data export/GDPR: https://www.sisulift.app/en/blog/workout-data-transfer-gdpr-guide ; https://correlate.davidyc.com/guides/apple-health-is-not-a-backup
- Accessibility: https://hona.fitness/accessibility.html ; https://www.beatrx.app/accessibility.html
- Primary literature cited via secondaries: Lally et al. (2010) Eur J Soc Psychol 40:998–1009; Gollwitzer & Sheeran (2006) Adv Exp Soc Psychol 38:69–119 (d=0.65, 94 tests); Deci, Koestner & Ryan (1999) meta-analysis, 128 studies.


---

# 附錄 A：審查後補充（非研究原文，審查註記與未驗證項目）

> 本附錄是 red team 審查後補上的註記，不是研究報告原文，也不是已經決定的規格。接手者不得把附錄的「建議修正」當成使用者已批准的決定；附錄列出的決策門未過之前，研究路線圖不得直接按週數執行。

## A.1 路線圖可行性註記（產品方向分析師）

- **Phase 0 兩週塞太多，且缺前置依賴**：Today 重建＋streak 重寫＋onboarding anchor＋iOS 推播流程＋匯出＋刪帳號＋離線測試＋5 位真實使用者測試，兩週內同時做完不現實，且未寫人力假設。建議拆成 0a「合併＋遷移＋決策」與 0b「Today＋寬容連續＋離線檢查」；匯出改寫為「補 CSV（JSON 備份已存在，見現況 `backup.js` 的 `bk-download`）」；刪帳號移到 Q5 決定之後。
- **Phase 1 四週超載**：約 30 個動作人工文案＋4 套模板＋順序引擎＋預填＋雙重漸進＋PR＋健身房達標率＋Progress 趨勢＋匯出／匯入 round-trip＋think-aloud，本身已超載；研究 §3.6 的 10 張表＋IndexedDB＋同步衝突規則根本沒算進工期。建議 Phase 1 先砍到「1 套上肢＋1 套下肢＋順序引擎＋預填＋雙重漸進」，B 模板與 Progress 趨勢移到 Phase 1b 或 Phase 2。
- **Phase 1 漏掉初學者保護**：研究 §3.4 的「前兩週學動作、每動作 2 組、不顯示 PR 壓力文案」在 Phase 1 清單與資料模型裡都無對應（無 beginner 旗標、無兩週低量階段、無隱藏 PR 比較文案的開關）。須在 Phase 1 清單補上，或明確寫「本 MVP 不收新手」並承擔後果。
- **Phase 2 名不副實且 Day-30 門檻時間上不可能**：標題說「只強化不擴張」，清單卻含匯入 Strong／Hevy CSV、更豐富睡眠、20 條探索提示、衡量儀表板四個新功能；Day-30 需要 30 天觀察期，Phase 2 本身只有 4 週，若 cohort 在 Phase 2 才招募，門檻在 Phase 2 結束時驗不完；若 cohort 早在 Phase 0 就開始，又違反「用冷啟動 cohort、不是親友」的要求。建議：無障礙基礎（對比、44pt、Reduce Motion、VoiceOver 標籤）移到 Phase 0；Phase 2 改名為「Harden＋兩個有條件擴張」或把匯入／提示清單移到 Phase 3；Day-30 門檻移到第 11 週後驗收，並寫明 cold cohort 的招募與定義。
- **成功門檻不可執行且砍功能門檻打架**：Phase 0「沒有人能描述出懲罰」是主觀訪談、無腳本、樣本只有 5 人；Phase 1「zero navigation confusion」是絕對零、不可證偽，且只寫「a Mixed user」（單數）；Phase 2 砍功能用 <10% 週使用率，Remove 清單用 <20%（1 in 5），同一文件兩個標準，且會誤殺匯出、刪帳號、疼痛暫停這種低頻但關鍵的功能。建議每個門檻補 n、任務腳本、通過標準；砍功能規則改為分級（高頻功能用週使用率，低頻關鍵功能豁免），並統一為一個數字。
- **資料模型不是 MVP 模型**：10 個實體＋RPE＋RIR＋預估 1RM＋WeekPlan＋StreakState，且 `video_url` 欄位與 Defer 清單「video libraries」直接衝突。建議 MVP 模型砍到 Session／SetLog／PR／ProgressionState 四張核心表，刪 `video_url`，RPE／RIR 列為第二階段；或把 §3.6 改名為「目標模型（非 MVP）」。
- **Progress 與衡量儀器本身就是擴張**：研究 §2.3 Cut 欄反對「6 張以上卡片的儀表板」，Phase 1 的 Progress 卻一次上 heatmap＋volume＋sleep 三種趨勢；§2.7 的 7 項指標＋每月問卷是給團隊的儀表板，卻拖到 Phase 2 才建，Phase 0／1 的門檻（30 秒、return rate）到時根本沒有儀器可量。建議 Phase 1 Progress 只留「PR 清單＋28 天 heatmap」；衡量儀器的最小版（time-to-start、adherence、return rate 三項埋點）移到 Phase 0，問卷與 volume 趨勢延後。
- **「一天一個 Start」在自己的線框裡就破了**：「視覺上只有一個主按鈕」不等於「一天一個 Start」——使用者當下仍要三選一，再加上每週模式設定＋每日 override 等於兩個改模式的地方。建議改寫為「一個視覺主按鈕＋次要選項摺疊」，或把 home／rest 做成 Start 之後的二級選擇。
- **睡眠豐富化與探索提示清單違反「10 秒支柱」**：Phase 2 的「更豐富睡眠」與「20 條提示」都沒有寫觸發條件（多少使用者問、多少比例才算數），等於預設會做；20 條提示清單離「內容 feed」只差一步。建議兩項都改為條件式（例如 Phase 1 訪談中探索空白率超過某一門檻才做提示清單），並寫明提示清單不滾動、不每日更新，否則就是 feed。
- **Defer／Remove 缺口**：現況功能（語音導引計時器、Boss Day、按星期選課的居家課表、回歸 ×1.5、≥30 成就收藏）在 Keep／Cut／Defer／Remove 四張表裡完全沒有位置；Defer 清單亦未列 plate calculator、periodisation、video form checks，而 Plan 頁的拖曳改建議日＋模板編輯＋swaps 本身就是輕量 builder，邊界（改到什麼程度算 builder）未定義。建議補現況功能處置表（見 §1.7.3 第 8 門）與 Defer 補列，並寫明 Plan 頁可改的上限（只能改建議日與 swaps，不能改組數／動作庫）。
- **AFT 計分未決定**：AFT 評分表既沒進 Defer，也沒排進任何 Phase；居家模式定位又是「AFT 居家三項達標」。建議明確二選一：(a) Defer AFT 計分，只做 push／plank／run 原始成績紀錄；或 (b) Phase 1 前取得官方量表並 date-stamp，否則不顯示分數。
- **PWA 提醒與離線順序顛倒**：Phase 0 就上線「一個提醒」，推播可靠度測試卻拖到 Phase 2；若使用者沒裝到主畫面，提醒會靜默失效，且無 fallback（例如應用內提醒、行事曆匯出）。建議 Phase 0 就做「提醒失效 fallback＋安裝率量測」；Phase 1 驗收加「健身房離線完整記錄（飛航模式下開→記錄→重開不丟）」。
- **AFT 誠實拆分只出現一次**：研究 §3.1 說居家只能練伏地挺身／平板／跑步類比、硬舉／搬運拖曳需健身房／場地，但 Phase 1 模板只列 hinge／squat，沒有 sprint-drag-carry 的場地類比、沒有 3RM deadlift 測驗、沒有 4–6 週 retest 排程。建議 Phase 1 模板或 Progress 頁加「AFT 覆蓋 honest label」（已覆蓋 push／plank／run 類比；deadlift 模式以 hinge 間接練；sprint-drag-carry 需場地，App 內不宣稱覆蓋），或明確 Defer AFT 宣稱。

## A.2 研究內部矛盾清單（照貼後放大，接手者不得自行猜測）

- **順序制範例自相矛盾**：見 §1.7.2「訓練排程」列，必須先二選一並修正範例。
- **暫停狀態數量不一致**：研究 §2.2 四種（Rest／Sick／Break／Travel），§3.4／§3.6 三種（Break 消失），須統一狀態表。
- **PR 儲存表頭與正文矛盾**：研究 §3.5 表頭「Separate stores」，正文「same PR table with a `mode` field」，須統一為「同一張表＋mode 欄位，顯示與計分分開」。
- **同步衝突規則打架**：`last-write-wins per session` 與「已完成 session 永不被覆寫」在已完成後又被舊裝置改寫時打架，須寫死優先規則與衝突副本處理。
- **模式預設標籤矛盾**：Mixed 既標示 (recommended)，又說新使用者預設 Home，須按 §1.7.2 改寫。
- **Phase 0／Phase 1 時序矛盾**：Phase 0 說「before any gym code」，卻要求 Today 重建成研究 §3.3（本身就是健身房日的畫面，含 Upper A 與健身房狀態 chip）。須改為「Today 先建成居家版；健身房 chip／序列待 Phase 1」。
- **Phase 1 成功門檻要求 Phase 2 才做的功能**：Phase 1 門檻要求「PRs survive export/import round-trip」，但 import 工作項在 Phase 2，Phase 1 時間點不可達成。須把 import 提前到 Phase 1，或把門檻改為「PRs survive export」。
- **Phase 0 成功門檻語句寫錯**：Phase 0 寫「complete a full home session offline in <30s from open to first set」，但 30 秒標準在研究 §2.7／§4.3 的定義是「開 App 到記下第一組」，不是「完成整堂課」。須改為「5 位使用者開 App 到記下第一組＜30 秒（離線），且能完整走完一堂居家課（不限時）」。
- **開放問題已被預設的完整清單**：Q1（XP 封頂數字）、Q2（目標族群：研究同時收納 AFT＋增肌兩群，且稱「只改模板內容、不改架構」是低估——若只選一群，整合架構本身就不存在）、Q3（探索定義：自由文字一行 vs 固定提示清單 vs 不得是內容 feed 三方拉扯）、Q4（手動睡眠：Phase 0 已是手動版，Defer 又說原生僅在手動成最大抱怨時才重訪）、Q5（單機 vs 雲端：§3.6 已假設有後端）、Q6（模板作者：Phase 1 的「seed ~30 lifts」預設為未驗證先建，與「未驗證不得當成已指導」衝突）、Q7（家／gym 平衡：4＋3 假設）。建議把 §4.5 改為「決策狀態表」，每題標「已預設（見 §x）／真正未決」，並在 Phase 1 開工前設決策門。

## A.3 仍未驗證的項目（不得在交付時宣稱為已驗證）

- GitHub 上 PR #28 的 CI 狀態（本地全綠已驗證，CI 未另外確認）。
- 瀏覽器端 v30→v31 快取實際升級流程（未在真機上驗證）。
- P2 探索解鎖後的 Perfect Day 定義（已知設計邊界，目前只算動＋眠）。
- 研究報告的所有領先 App 價格與功能（來自 2026 年 roundup／二手整理，未逐一動手測試、未登入驗證；引用前須再對原始商店頁面，特別是 Fitbod、Hevy Pro、Finch Plus）。
- 留存率百分比（各家定義不同，只有「前期掉得很快、之後趨平」的形狀比較可信，不得引用單一百分比當成事實）。
- 研究報告的習慣科學數字本身（Lally、Gollwitzer & Sheeran、Deci 等）是透過二手整理引用，未在本審查中重新核對原始論文全文；21 天迷思被否定、66 天中位數等說法，引用時須保留「中位數、範圍、偏誤風險」的完整限定，不得簡化為「66 天養成習慣」。
- AFT 評分表（年齡／性別／兵種）：研究刻意未重現，若 daily-ten 要計分，須以官方量表為準並 date-stamp，標準在 2025–2026 年間有變動。
- daily-ten 現況程式碼是否已有後端／同步（研究假設為 PWA only；若已有後端，§3.6 模型須調整）。
- Vercel 介面的獨立頁面抓取驗證（部署結果為 READY，未獨立抓取驗證）。
- 睡眠 full／near 的完整時間窗定義、回歸徽章名稱與「3 天內」起算日、Boss Day 的星期對照（規則檔數值已載入 §1.3，但上述語義未在本文件完全展開，實作前須查程式碼）。
- 草稿第 1 節中青森住宿的房型細節（12 疊＋4 疊附陷腳暖桌、浴廁）、取消政策（7 天前 10%、3 天前 50%、前一天 70%、當天／未出現 100%）、入浴稅另付，以及 PayPay 郵件的完整時間戳——本文件 §1.6 為簡述，上述細節未完整載入，接手者若需處理住宿／付款事項，須以原始郵件為準，不得憑本文件補細節。

## A.4 本次審查的 verdict 依據

- 研究正文：逐字完整，diff 0 行，資訊量 100% 保留。
- 第 1 節：經上述修正（前言指引、等級公式、睡眠／探索／Boss Day 參數、回歸參數、PR 標題、測試檔名與失敗對應、Vercel 關係、reel 重複限定、健康目標假設限定、§1.6 簡述修正、替身舊 brief 廢棄說明）後，事實錯誤已修正，剩餘缺口皆已明確標示為「未載入、須查程式碼」，不再偽裝成已確認。
- 邏輯與路線圖：經 §1.7 對照表、決策門與本附錄註記後，衝突已全部明示為待決策，不再默默混讀；但路線圖本身仍不可直接按週數執行，必須先過 §1.7.3 的 8 道決策門。
- 因此最終 verdict 為 **條件式 PASS**：作為「完整脈絡＋研究原文合訂本」可以交付給接手 Agent；作為「可直接執行的開發規格」仍為 FAIL，直到 8 道決策門通過、路線圖按附錄 A.1 修正為止。審查報告中必須同時寫這兩句，不得只寫 PASS。
