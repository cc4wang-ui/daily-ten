# Daily Ten — 下一個對話接手

> 截至 2026-10-02（Asia/Tokyo）。直接把本檔貼到新對話。先對照 repo 最新 `main`，不要用舊 PR 描述或這份快照覆蓋更新後的實作。開發流程一律走 `.claude/skills/daily-ten-dev/SKILL.md`。

## 🎯 服務目標

Daily Ten 是 Cross 的個人成長遊戲 PWA：動（訓練）、眠（睡眠）、探（探索）三支柱，睡眠先行、分階段解鎖（P1 睡飽 → P2 探索 → P3 學習專案），即時正向回饋、每週與季度目標；無帳號、離線可用、低摩擦、不懲罰。AFT 三項是男性 17–21 歲自選目標，不宣稱正式 AFT 通過。完整原則與決策見 [CLAUDE.md](./CLAUDE.md)（D1–D21）、[PLAN.md](./PLAN.md)。

## 📍 當前階段

- Repo：[cc4wang-ui/daily-ten](https://github.com/cc4wang-ui/daily-ten)；App 網址 `https://cc4wang-ui.github.io/daily-ten/`（Pages 已啟用、部署成功；真機開啟待 Cross 確認）。
- PR #7（指示檔＋網址）已 merge。**M1 地基**在分支 `m1/foundation`（PR 見 GitHub）：ES modules 拆分（行為零變更）、state v3＋遷移、載入失敗保護、備份下載＋7 天提醒、匯入驗證／預覽／二次確認、台灣用語表檢查、Playwright＋CI、SW v6。
- 未驗證：iPhone 真機（開啟、舊紀錄還在、飛航模式、下載備份到「檔案」、匯入、TTS＋示範）。

## ⏭ 下一步（依優先序）

1. Cross：merge M1 PR → 照 PR 的真機清單逐條勾。
2. M2a 開工前 checkpoint：確認起床／就寢目標（U2，預設 07:00／23:00，可在設定改）。
3. M2a 睡飽＋目標：engine（XP／等級／streak／freeze／Perfect Day／階段）、早安打卡、D6 自動降量、D18 時段漸進計分、D19 回歸任務、每週目標、季度目標、`.ics`、90 天 sim。派工：game-designer＋data-guardian → ui-engineer → qa-checker。

## 必須保留的 project knowledge

- **架構**：`index.html` 只有 markup；`js/app.js` 在 `boot()` 內動態 import 各 module，失敗顯示啟動失敗卡、不白屏。state 只能經 `js/state/store.js`（`loadState/getState/setState/saveState`）與 `backup.js` 存取；每次用 `getState()` 重新取，不要快取物件。
- **state v3**：legacy `xp`、`streak` 是 M1 的真實來源，`saveState()` 會把它們**複製**到 `game`；M2a 由 engine 接手後要反過來雙寫 legacy 欄位（D12，避免舊版 App 覆寫）。`game.level` 為 null，由 engine 推導。`body.sleep` 與 `habits.sleep.log` 並存不合併（D13）。
- **SW**：新增或改名 App 檔 → 更新 `sw.js` 的 `ASSETS`＋CACHE 版號 +1；CI `check-repo` 會擋漏列。
- **CI**：`npm test` 在 push 時跑；「拆 module 前後等價比對」以 `ec87e03` 為基準，M2a 改畫面時要移除或改基準。用語表 baseline（`tools/jev/glossary-baseline.json`）只能在新增違規為 0 時重產，不得拿來吸收新違規。
- **課表**：新增或改名動作 → `demos.js` 的 `MAP`／`def` 與 SETUP 的 `VIDEOS`（`js/ui/content.js`）都要補。
- **Jev**：只在 build time（M3）；前端零 AI 呼叫、零 API key。
- 官方計分表：[AFT 2025 表](https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf)。17–21 歲男性 Plank 60 分是 1:30；不能重新引入 1:25。

新對話請先回覆「服務目標／當前階段／接下來要做」的三塊接手確認，再依最新 repo 與 Cross 的新指示行動。
