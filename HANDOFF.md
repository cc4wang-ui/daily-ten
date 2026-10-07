# Daily Ten — 下一個對話接手

> 截至 2026-10-05（Asia/Tokyo）。直接把本檔貼到新對話。先對照 repo 最新 `main`，不要用舊 PR 描述或這份快照覆蓋更新後的實作。開發流程一律走 `.claude/skills/daily-ten-dev/SKILL.md`。

## 🎯 服務目標

Daily Ten 是 Cross 的個人成長遊戲 PWA：動（訓練）、眠（睡眠）、探（探索）三支柱，睡眠先行、分階段解鎖（P1 睡飽 → P2 探索 → P3 學習專案），即時正向回饋、每週與季度目標；無帳號、離線可用、低摩擦、不懲罰。AFT 三項是男性 17–21 歲自選目標，不宣稱正式 AFT 通過。完整原則與決策見 [CLAUDE.md](./CLAUDE.md)（D1–D26）、[PLAN.md](./PLAN.md)。

## 📍 當前階段

- Repo：[cc4wang-ui/daily-ten](https://github.com/cc4wang-ui/daily-ten)；App 正式網址 `https://daily-ten-app.vercel.app/`（D24，Vercel）；舊網址 `https://cc4wang-ui.github.io/daily-ten/` 只剩搬家卡。
- PR #7（指示檔＋網址）、PR #8（**M1 地基**）、PR #9（U2 紀錄）、PR #10（**D23 自動更新**，SW v7）、PR #11（**D24 搬到 Vercel**，SW v8）、PR #12（**V1 亮色＋三環＋早安打卡**，SW v9）、PR #13（**D27 放棄備份**：今日頁不再有備份提醒與匯入卡，SW v10）、PR #14（**V2a 遊戲核心**：Perfect Day、升級卡、Freeze、D6 降量、D19 回歸任務、90 天 sim，SW v11）已 merge。Cross 放棄搬舊資料，新網址從頭開始。V1 內容：亮色外觀、分頁今日／訓練／統計＋右上設定、三環＋中央「Lv N」、「下一步」、早安打卡（D17、D18、10 秒復原）、engine 第一刀（`data/game.json`、04:00 遊戲日、XP 由紀錄推導、P1→P2 條件與探索閘門）。
- 未驗證：iPhone 真機（V1 亮色與狀態列、早安打卡與復原、iOS 時間選擇器、飛航模式冷啟動、TTS＋示範、自動更新）。PR #12 描述有逐條清單。
- 流程：低輸入模式（D22）——Cross 說「繼續」即可；QA PASS＋CI 綠燈由 Orchestrator 直接 merge。每週迴圈見 `docs/ITERATION.md`。

## ⏭ 下一步（依優先序）

1. **V2b 目標分頁（D28）**：先修 V2a 留下的 3 件小事（`reports/qa-v2a-1.md`）：① 慶祝卡「領取」連點兩下會把緊接著的升級卡一起關掉（`js/ui/celebrate.js`，ui-engineer）；② D6 降量只到當天第一次訓練為止，之後再練回到原強度（d11 的規則，game-designer 決定要不要整天有效）；③ D19 階段是 none 時仍顯示 V1 的「上次訓練是 N 天前」提示（合約寫回歸卡取代它，ui-engineer＋game-designer 對齊）。之後做：週回顧、選下週目標（`data/goals.json`）、季度目標、階段卡、`.ics` 就寢提醒；週目標 +50 會讓「普通」人設 90 天超過 Lv 15 → sim 要重跑校準。開工前先給 Cross checkpoint。
   - V4 前要 Cross 決定：P1→P2 條件（近 14 天 10 天起床在時段內）讓「普通」人設約第 77 天才解鎖；9/14 約第 34 天、8/14 約第 23 天（sim 數字）。
2. V3 統計＋成就 → V4 探索 → V5 收尾（暗色、教練一句、訓練畫面新風格）。
3. 週報（D25）：**D27 起暫停**（Cross 2026-10-06 放棄備份，週報沒有資料可讀）。排程 `daily-ten-weekly` 仍在、`enabled=false`，綁在原 session；Cross 說「恢復週報」才用 `update_trigger` 重開。今日頁已沒有備份提醒與匯入卡，設定頁仍可手動下載／匯入。

## 必須保留的 project knowledge

- **架構**：`index.html` 只有 markup；`js/app.js` 在 `boot()` 內動態 import 各 module，失敗顯示啟動失敗卡、不白屏。state 只能經 `js/state/store.js`（`loadState/getState/setState/saveState`）與 `backup.js` 存取；每次用 `getState()` 重新取，不要快取物件。
- **state v3**：V1 起畫面上的 XP、等級、連續天數都由 engine 從紀錄推導（`js/game/engine.js` 的 `todaySummary`），不寫入 state；legacy `xp`、`streak` 仍照舊表累加並**複製**到 `game`（D12，給舊版 App），和畫面數字不同。睡眠紀錄存打卡當下的 `target`；加一輪記 `sessions[].plus`；新的訓練紀錄用 04:00 遊戲日。`body.sleep` 與 `habits.sleep.log` 並存不合併（D13）。
- **SW**：新增或改名 App 檔 → 更新 `sw.js` 的 `ASSETS`＋CACHE 版號 +1；CI `check-repo` 會擋漏列。
- **CI**：`npm test` 在 push 時跑；等價比對以 `ec87e03` 為基準，V1 起只比訓練畫面家族（計時、暫停、Boss 測驗、示範視窗）與課表規則；V5 改訓練畫面時再退役。用語表 baseline（`tools/jev/glossary-baseline.json`）只能在新增違規為 0 時重產，不得拿來吸收新違規。
- **課表**：新增或改名動作 → `demos.js` 的 `MAP`／`def` 與 SETUP 的 `VIDEOS`（`js/ui/content.js`）都要補。
- **Jev**：只在 build time（M3）；前端零 AI 呼叫、零 API key。
- 官方計分表：[AFT 2025 表](https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf)。17–21 歲男性 Plank 60 分是 1:30；不能重新引入 1:25。

新對話請先回覆「服務目標／當前階段／接下來要做」的三塊接手確認，再依最新 repo 與 Cross 的新指示行動。
