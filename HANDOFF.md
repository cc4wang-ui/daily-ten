# Daily Ten — 下一個對話接手

> 截至 2026-10-04（Asia/Tokyo）。直接把本檔貼到新對話。先對照 repo 最新 `main`，不要用舊 PR 描述或這份快照覆蓋更新後的實作。開發流程一律走 `.claude/skills/daily-ten-dev/SKILL.md`。

## 🎯 服務目標

Daily Ten 是 Cross 的個人成長遊戲 PWA：動（訓練）、眠（睡眠）、探（探索）三支柱，睡眠先行、分階段解鎖（P1 睡飽 → P2 探索 → P3 學習專案），即時正向回饋、每週與季度目標；無帳號、離線可用、低摩擦、不懲罰。AFT 三項是男性 17–21 歲自選目標，不宣稱正式 AFT 通過。完整原則與決策見 [CLAUDE.md](./CLAUDE.md)（D1–D26）、[PLAN.md](./PLAN.md)。

## 📍 當前階段

- Repo：[cc4wang-ui/daily-ten](https://github.com/cc4wang-ui/daily-ten)；App 正式網址 `https://daily-ten-app.vercel.app/`（D24，Vercel）；舊網址 `https://cc4wang-ui.github.io/daily-ten/` 只剩搬家卡。
- PR #7（指示檔＋網址）、PR #8（**M1 地基**）、PR #9（U2 紀錄）、PR #10（**D23 自動更新**，SW v7）、PR #11（**D24 搬到 Vercel**，SW v8）已 merge。Cross 放棄搬舊資料，新網址從頭開始。M1 內容：ES modules 拆分（行為零變更）、state v3＋遷移、載入失敗保護、備份下載＋7 天提醒、匯入驗證／預覽／二次確認、台灣用語表檢查、Playwright＋CI、SW v6。
- 未驗證：iPhone 真機（開啟、舊紀錄還在、飛航模式、下載備份到「檔案」、匯入、TTS＋示範、自動更新）。v6→v7 這一次要從多工畫面滑掉再開，先等畫面自己刷新（約 10 秒）再訓練；v7 起全自動。
- 流程：低輸入模式（D22）——Cross 說「繼續」即可；QA PASS＋CI 綠燈由 Orchestrator 直接 merge。每週迴圈見 `docs/ITERATION.md`。

## ⏭ 下一步（依優先序）

1. **V1 外觀＋三環＋早安打卡（D26，進行中）**：範圍與介面見 CLAUDE.md §8、`docs/vnext-mockup/`。派工：game-designer（`data/game.json`、`js/game/`、`js/habits/sleep.js`）＋data-guardian（`js/state/habits.js`、匯入驗證）＋ui-engineer（亮色外殼、分頁今日／訓練／統計＋設定齒輪、三環、早安打卡）→ qa-checker。CI 的拆 module 等價比對要縮小：保留課表規則等價與訓練畫面家族，退役首頁／紀錄／身體／Boss 輸入與 SETUP 結構比對。
2. V2 遊戲核心＋目標 → V3 統計＋成就 → V4 探索 → V5 收尾（CLAUDE.md §8）。
3. 週報（D25）：排程 `daily-ten-weekly` 綁在原 session（那裡才有 Google Drive／Vercel 連接器），每週一 07:45 東京；Cross 每週存一份備份到 Drive 才有內容。

## 必須保留的 project knowledge

- **架構**：`index.html` 只有 markup；`js/app.js` 在 `boot()` 內動態 import 各 module，失敗顯示啟動失敗卡、不白屏。state 只能經 `js/state/store.js`（`loadState/getState/setState/saveState`）與 `backup.js` 存取；每次用 `getState()` 重新取，不要快取物件。
- **state v3**：legacy `xp`、`streak` 是 M1 的真實來源，`saveState()` 會把它們**複製**到 `game`；M2a 由 engine 接手後要反過來雙寫 legacy 欄位（D12，避免舊版 App 覆寫）。`game.level` 為 null，由 engine 推導。`body.sleep` 與 `habits.sleep.log` 並存不合併（D13）。
- **SW**：新增或改名 App 檔 → 更新 `sw.js` 的 `ASSETS`＋CACHE 版號 +1；CI `check-repo` 會擋漏列。
- **CI**：`npm test` 在 push 時跑；「拆 module 前後等價比對」以 `ec87e03` 為基準，M2a 改畫面時要移除或改基準。用語表 baseline（`tools/jev/glossary-baseline.json`）只能在新增違規為 0 時重產，不得拿來吸收新違規。
- **課表**：新增或改名動作 → `demos.js` 的 `MAP`／`def` 與 SETUP 的 `VIDEOS`（`js/ui/content.js`）都要補。
- **Jev**：只在 build time（M3）；前端零 AI 呼叫、零 API key。
- 官方計分表：[AFT 2025 表](https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf)。17–21 歲男性 Plank 60 分是 1:30；不能重新引入 1:25。

新對話請先回覆「服務目標／當前階段／接下來要做」的三塊接手確認，再依最新 repo 與 Cross 的新指示行動。
