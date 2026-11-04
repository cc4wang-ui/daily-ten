# 獨立把關報告｜redo-v1

## 第 2 輪判決（分支 redo/v1-habits @ 94083d6，2026-11-04）

- **成品：FAIL（殘留 1 項，僅在「今天都完成了」狀態）**——`.hero.done` 的次要文字仍用 `--on-ink-2 #CBD5E1`：「今天」`.label`（13px/600）在 `#0F766E` 上 **3.69:1**；`.xp-pill`「今日 +N XP」（13px/700）在 14% 白疊 `#0F766E`（合成 `rgb(49,137,130)`）上 **2.81:1**，即使改白字也只有 4.17:1。AA 需 4.5。其餘第 1 輪阻擋項已修、無回歸。建議 **ui-engineer** 修 `css/app.css:63/67`（只影響 1 個狀態的 2 個小字）。
- 契約忠實度：PASS（不變）。

### S7 對比實測（Chromium 實際渲染值，`r2-btn-*.png`、`r2-hero-done.png`）

| 元素 | 前景 | 背景 | 字級 | 比值 | AA |
|---|---|---|---|---|---|
| `#gym-start` | #FFF | rgb(194,65,12) | 17px/700 | **5.18** | ✓（第 1 輪 2.80） |
| `#st-start-full` | #FFF | rgb(15,118,110) | 17px/700 | **5.47** | ✓（第 1 輪 2.49） |
| `#st-start-full .sub` | #FFF | 同上 | 12px/600 | **5.47** | ✓（第 1 輪 1.68） |
| `#ex-done` | #FFF | rgb(109,40,217) | 17px/700 | **7.10** | ✓（第 1 輪 4.23） |
| `#ex-done .sub` | #FFF | 同上 | 12px/600 | **7.10** | ✓ |
| `.hero.done h2` | #FFF | rgb(15,118,110) | 20px/800 | **5.47** | ✓ |
| `.hero.done .label`（「今天」） | #CBD5E1 | rgb(15,118,110) | 13px/600 | **3.69** | ✗ |
| `.hero.done .xp-pill` | #CBD5E1 | 合成 rgb(49,137,130) | 13px/700 | **2.81** | ✗ |

### 回歸（第 2 輪）
- `npm run test:unit`：16/16。`node .github/scripts/check-repo.mjs`：通過（App 檔 39、預快取 40、CACHE v35 > main v34）。
- `PORT=4400 … playwright test --workers=4`：**353 passed (20.5s)**。
- 已確認修正落地：`css/app.css:52-53,67`；`js/ui/celebrate.js:15-16` 改讀 `rules().bonus`；`js/ui/stretch.js:38` 讀 `video2`、`js/ui/gym.js:31` 讀 `alt`；`data/game.json` d7/d8 註解已對齊引擎。
- 未再驗的非阻擋項（第 1 輪 2、4、7）：總結加成明細與週目標提示未重新實測。

---

# 第 1 輪（@ 8893d80）

把關時間：2026-11-04（Asia/Tokyo）。只讀 repo、只跑指令與 Playwright；未修改任何產品檔。
截圖與腳本：`/tmp/claude-0/-home-user-daily-ten/3ac32758-328d-5253-ab17-a4f8e18cf355/scratchpad/qa/`（`walk.mjs`、`walk2.mjs`、`swcheck.mjs`、`01-…15-*.png`）。

## 判決

- **契約忠實度：PASS**（S1–S10 涵蓋 Cross 四個目標；兩處「量化代換」列在保留意見，未縮小範圍）
- **成品：FAIL（1 個阻擋項）**——S7「文字對比 AA」未達：三個習慣頁的主按鈕（白字 17px/700 壓在 `--gym` `#F97316`、`--stretch` `#14B8A6`、`--explore` `#8B5CF6`）對比 2.80／2.49／4.23，低於 AA 4.5:1；按鈕內 `.sub`（「+40 XP」等，`#CBD5E1`）只有 1.68–1.89。其餘 S1–S6、S8、S9 全部 PASS；S10 待上線。

## A. 契約忠實度（Cross 原話 → STOP 條件）

| Cross 原話 | 對應 | 判定 |
|---|---|---|
| 一週四次健身房／每天早上伸展 15 分鐘／一個禮拜嘗試一件新事物 | S1（x/4、x/7、x/1）、S2、S3、S4 | 涵蓋 |
| 套入遊戲化框架、循著規則自我正向回饋 | S5（XP／等級／連續＋Freeze／Perfect Day／Perfect Week／成就／慶祝；數值在 data） | 涵蓋 |
| UI 照主流習慣養成＋健身 App copy paste；注意資訊量、顏色、編排 | S7（亮色、底部分頁、卡片、每習慣一色、≥44px、375px 不橫捲、對比 AA、用語表） | 涵蓋，但「資訊量／編排」沒有量化條件，只能靠截圖肉眼判斷（見保留意見 1） |
| 示範影片用 YouTube 點擊率最多、相關性最高的 Shorts，不要自己編 | S6（觀看數最高＋相關；/shorts/ 回 200；記錄觀看數／頻道／查核時間） | 涵蓋；「點擊率」代換為「觀看數」（YouTube 不公開點擊率，合理代理，見保留意見 2） |
| 明天早上看到完整交付物（上線可用） | S8（原則不變）、S9（品質門）、S10（上線） | 涵蓋 |
| /board-intake 調度 skill 與 MCP；Fable 判斷即我的判斷 | 流程指示，非成品條件；A1（睡眠退出主循環）、A7（舊測試與 76MB 影格移除）是依此授權做的判斷 | 無縮小／偷換 |

## B. 成品逐條

| 條件 | 判定 | 證據 |
|---|---|---|
| S1 今日頁：三習慣今日狀態＋本週進度、一顆主行動 | PASS | 截圖 `01-home-fresh.png`：hero「下一步：晨間伸展 15 分鐘」只有一顆「開始」；三列 `.habit`（`js/ui/home.js:190-195`）；legend「健身房 0/4 伸展 0/7 探索 0/1」（walk 輸出 `home habit rows: 3`）。全部完成後 `12-home-all-done.png`：「Perfect Day，今天都完成了。」、1/4、1/7、1/1 |
| S2 健身房：Upper/Lower 輪替、逐組重量×次數、上次預填、休息計時、總結＋XP | PASS | `06-gym-session-start.png`：Upper A 7 動作 14 組、「上次／kg／次／✓」表（`js/ui/gym.js:335-339`）；勾第 1 組（複合）休息 2:30、5 秒後 2:25（`07-gym-rest-timer.png`）、孤立組 1:15，與 `data/game.json rest {150,75}` 一致；總結 `08-gym-summary.png`「Upper A 完成 / +130 XP / 2,240 kg / 14/14 / 本週 1/4」；輪替 `js/game/core.js:218-220`（`completedGym % 4`）。上次預填與 PR 由 e2e `habits.spec.js:118-150` 驗（22.5 kg 預填 20、PR +170）—353 全綠 |
| S3 伸展：15 分 8 項倒數自動換項＋5 分短版、一鍵完成、每項看示範 Short | PASS | 重算 `data/stretch.json`：full 合計 **900 秒／8 項**、short 合計 **300 秒／5 項**。`03-stretch-guide-item1.png`：貓牛式 1:30、剩 15:00；假時鐘 +90 s 自動到「穿針式 第 2/8 · 第一邊」、+61 s 顯示「換邊」（`04-…sideswitch.png`）；跑完 749 s 自動結束→toast「伸展完成 +40 XP 復原」，`stretch.log` 記 `{variant:'full', seconds:900}`。一鍵：`#st-mark-full`（`js/ui/stretch.js:443`）。每項 `linkHtml` 連到 `youtube.com/shorts/<id>`（`stretch.js:454`）。注意：`stretch.json` 的 `video2:"down-dog"` 沒有任何 JS 讀取（`grep -rn video2 js/` 無結果），「下犬＋兒童式」只顯示兒童式那支（研究報告已標註） |
| S4 探索：本週任務卡、洗牌、1–5 興趣分、每週 1 次計入 | PASS | `10-explore-card.png`：類別／地點／時間／費用／兩分鐘版本／完成條件／提示；「換一個」後標題改變（walk：`手沖一杯咖啡 → 下北澤古著街閒逛 different=true`）；`11-explore-rate.png` 五顆星；存檔 `interest:4`；toast「探索完成 +60 XP」；legend 探索 1/1。`data/explore.json` 67 筆（重算） |
| S5 遊戲化：XP／等級／連續（Freeze）／Perfect Day／Perfect Week／≥20 成就／慶祝；數值在 data | PASS（2 個非阻擋瑕疵） | 自己重算：40（伸展）＋100（健身房）＋30（Perfect Day）＋60（探索）＋50（探索週目標）＝**280**，畫面 `Lv 2 · 280 XP`、`80 / 250 XP`（200＋50×1＝250 ✓）。成就 **32** 筆（重算 `data/achievements.json`），完成後 4/32 解鎖（`13-progress.png`）。慶祝卡依序出現：身體醒過來 → Perfect Day +30 → 2 個新成就 → 升到 Lv 2 → 第一件新事物；confetti canvas（`js/ui/celebrate.js`）。Freeze／回歸／暫停由 `tests/core.test.mjs:76,101` 覆蓋。瑕疵：(a) `js/ui/celebrate.js:15-16` 把 Perfect Day／Week 顯示用的 `xp: 30`、`xp: 200` 寫死，引擎用 `data/game.json` 但卡片不是；(b) 探索週目標 +50 沒有任何 toast／卡片，使用者看到「+60」但總分跳 110；且 `game.json _notes d7/d8` 寫「週日結算」，引擎實際在達標當天發（`core.js` 註解「達標當天計入」），文件與程式不一致 |
| S6 示範影片：每動作／伸展各 1 支 Short、相關且觀看數最高、記錄觀看數／頻道／查核時間、/shorts/ 回 200 | PASS | `data/videos.json` 23 筆（22 筆主片＋1 筆 `down-dog` 備片）；13 個健身房動作與 8 個伸展項目全部有對應（重算：missing＝[]）；youtubeId 無重複；22 筆主片 `shortsStatus=200`、`views>0`、`channel` 非空、`checkedAt=2026-11-03T23:47:48Z`。自己用桌面 Chrome UA curl 5 支：`Kl3LEzQ5Zqs`、`xdbEG3xGLI8`、`5rIqP63yWFg`、`7mlnguqvrsA`、`T9ZA30LL-kY` 皆 **200** 且未轉向。抽查搜尋頁：`bench press form shorts` Shorts 區最高 59M＝選中的 `_FkbD0FhgVE`；`lat pulldown form` 前兩名 `bNmvKpJSWKM` 與 `hnSqbBk15tw` 皆顯示 15M（報告以精確值 15.78M > 15.09M 取後者，一致）。瑕疵：第 23 筆 `down-dog` `channel: null`，但 UI 不使用（同 S3） |
| S7 UI：亮色、底部分頁、卡片、每習慣一色、≥44px、375px 不橫捲、對比 AA、用語表 | **FAIL（對比）** | 亮色／底部五分頁／卡片／三色：截圖 01、02、10、13 確認。375px：六個畫面＋引導、訓練、休息列、兩個面板 `scrollWidth=375`、無元素超出右緣（walk 每個 `[audit]` 行）。用語表：`check-glossary --ci` 新增違規 0；渲染文字掃「窗口／時長／數據／設置／撤銷／視頻／信息／收下」0 命中。**對比**：實測 `#gym-start` `rgb(249,115,22)` 白字 17px/700 → 2.80:1；`#st-start-full` `rgb(20,184,166)` → 2.49:1；`#ex-done` `rgb(139,92,246)` → 4.23:1（`15-btn-*.png`）；同樣樣式用在 `#ss-finish`、`#gs-ok`、`#ex-save`；按鈕內 `.sub`（`--on-ink-2 #CBD5E1`）在橘／綠上 1.89／1.68。17px 粗體不算「大字」（AA 大字門檻 ≥18.66px 粗體），需 4.5:1。`css/tokens.css` 註解只算了「白底上的文字」，沒算「彩色底上的白字」。觸控：團隊規則只擋「寬與高都 <44」；嚴格 44×44 下有 `.video-link` 36–38px 高、`.add-set` 36px、`#rest-add/#rest-skip` 40px、健身房日按鈕寬 39px、`#h-streak-btn` 36px 高（非阻擋，列保留意見） |
| S8 原則：無帳號、離線（SW 預快取）、localStorage 單機、無 runtime AI、舊資料不白屏 | PASS | `check:repo` 通過（前端無 API key／AI 端點；外部網址只有 YouTube Shorts 與縮圖前綴）；walk 全程外部請求＝none（`i.ytimg.com` 縮圖以本機 1×1 PNG 代替）。SW：`daily-ten-v35` 快取 40 項（`swcheck.mjs`），`setOffline(true)` 後 reload `data-ready=1`、五個分頁可切、伸展紀錄仍在（`14-offline-reload.png`）。舊資料：e2e `data.spec.js` v1／v2／v3／V2a／checkin fixture 開啟無錯誤卡、`v3-phase1` 自動搬 1 課／2 伸展／1 探索且重開不重複、`corrupt-state.txt` 出錯誤卡＋另存 `.bak-v2`、壞檔匯入不動原資料 |
| S9 品質門：check-repo、glossary、unit、Playwright 全綠；CI 綠；把關者 PASS | PASS（把關者除外） | 本機：`check-repo：通過（App 檔 39、預快取 40、CACHE v35，main v34）`；glossary `新增違規 0`；`npm run test:unit` 16/16；`npx playwright test --workers=4` **353 passed (19.7s)**。CI run 41744848717 on `8893d80`：全部 step success。PR #30 open。`prefers-reduced-motion: reduce` 下 0 個元素有 animation／transition。console.error 0、pageerror 0 |
| S10 上線：merge main、正式網址 sw.js 版號＝main、首頁 JS 逐字相同 | 待上線 | `origin/main` sw＝`daily-ten-v34`；`https://daily-ten-app.vercel.app/sw.js` 目前也是 v34（＝舊版）；分支 v35 尚未 merge（PR #30 open） |

## 問題清單

### 跑不完／壞資料
無。全流程（伸展引導→健身房→探索→進度→重開）可跑完；資料檔重算一致。

### 其他
1. **[阻擋] S7 主按鈕對比不足**。重現：開 `#s-gym`（或 `#s-stretch`、`#s-explore`），量 `#gym-start` 的 `color`/`background-color` → 白 on `#F97316`＝2.80:1（AA 需 4.5）。同類：`#st-start-full` 2.49、`#ex-done` 4.23、`#ss-finish`、`#gs-ok`、`#ex-save`，及其內 `.sub` 1.68–1.89。建議由 **ui-engineer** 修（`css/app.css:50-52`、`css/tokens.css`）。
2. [非阻擋] 探索週目標 +50 無回饋：完成探索 toast 顯示「+60 XP」，總分實際 +110（`core.js` weeklyGoal 事件）；hero「今日 +280 XP」與列上「+60」對不上。重現：全新狀態完成一次探索，看 `.tag.xp`。建議 **game-designer**／**ui-engineer**。
3. [非阻擋] `js/ui/celebrate.js:15-16` 慶祝卡 XP 數字寫死 30／200，違反「數值只在 data」；`data/game.json _notes d7/d8` 的「週日結算」與引擎「達標當天發放」不一致。建議 **game-designer**。
4. [非阻擋] 健身房總結與 toast 顯示的是「差額」（含 Perfect Day 30 → +130），下一張 Perfect Day 卡又再顯示 +30，使用者可能以為拿了 160。建議 **ui-engineer**。
5. [非阻擋] `data/stretch.json` `video2:"down-dog"` 無程式讀取；`videos.json` 第 23 筆 `down-dog` `channel:null`。「下犬＋兒童式」只給兒童式示範。建議 **ui-engineer**（顯示第二支）或 data-guardian（刪欄位）。
6. [非阻擋] `data/gym.json` 「深蹲或腿推」`alt:"leg-press"` 有影片但 UI 只顯示 squat 那支。
7. [非阻擋] 觸控目標嚴格 44×44 未全達（見 S7 列），團隊 `expectTouchTargets` 規則較寬（只擋兩邊都 <44）。

## 保留意見
1. 「資訊量、顏色、編排像主流 App」沒有可量化條件；我以截圖判斷版型（主行動卡＋習慣列＋三環＋週條、Hevy 式組數表、底部分頁）確實對齊主流樣式，但這是主觀判斷。
2. 「點擊率最高」以「觀看數最高」代理；相關性靠標題／說明／縮圖，研究報告自承未逐支看完影片，我也只抽查 3 個搜尋頁、未逐支看。
3. 本機 Playwright 以假時鐘跑流程，`06-gym-session-start.png` 上殘留的彩帶是假時鐘下 canvas 未清除的測試假象，不是真機行為。
4. 上線（S10）與 iPhone 真機（Safari 開 YouTube App、PWA 離線、聲音提示）本機無法驗。

## Cross iPhone 真機清單
- [ ] 主畫面 App 點「看示範 Short」會跳 YouTube App 並播放正確影片
- [ ] 飛航模式開 App：今日／健身房／伸展／探索／進度都能開，縮圖變灰塊、口令文字仍在
- [ ] 伸展引導換邊與換項的提示音在靜音開關關閉時仍聽得到（或可接受沒聲音）
- [ ] 健身房組數表在 iPhone 鍵盤彈出時「✓」按鈕仍點得到
