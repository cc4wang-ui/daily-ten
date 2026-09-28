# Daily Ten — 下一個對話接手

> 截至 2026-09-28（Asia/Tokyo）。直接把本檔貼到新對話。先對照 repo 最新 `main`，不要用舊 PR 描述或這份快照覆蓋更新後的實作。

## 🎯 服務目標

Daily Ten 是個人訓練 PWA：降低每日出席門檻、依星期自動排十動作／加強／恢復／測驗，追蹤 streak、BODY 與三項自選 AFT 訓練目標。三項採男性 17–21 歲各 60 分門檻：HRP 15 下、Plank 1:30、2 英里跑 19:57。正式 AFT 有五項，App 不宣稱通過正式測驗。

## 📍 當前階段

- Repo：[crosswang-collab/daily-ten](https://github.com/crosswang-collab/daily-ten)。先讀 [PROJECT_STATE.md](./PROJECT_STATE.md)、[README.md](./README.md)、[COMPETITORS.md](./COMPETITORS.md)、`index.html`、`demos.js`，再看 `mockup.html`。
- Codex 影片／競品版**沒有找回**；Cross 於 2026-09-28 決定重建為新功能，不稱為恢復。
- 已做：PWA、展示頁、週輪替課表、BODY、v1→v2 狀態遷移、彈力帶／徒手開關；**53 個離線線條示範動畫**（訓練中同步播放、休息時播下一個、SETUP 示範視窗＋YouTube 搜尋連結）；競品對標文件；SW 快取 v5。
- 現況界線：本機 Chromium 端對端檢查通過（覆蓋率、播放／暫停、離線重載、舊資料遷移）。GitHub Pages、iPhone 安裝／離線／TTS、動畫在真機的流暢度未驗證。示範未經教練審核；競品資料未在商店頁核對。沒有 CI。

## ⏭ 下一步（依優先序）

1. Cross 在真機逐一看示範動畫，回報看不懂或姿勢不對的動作（SETUP → 每列「示範」）。
2. 公開部署、iPhone 安裝、離線重開、TTS＋動畫同時跑、備份／還原實測；回報證據，不把推測當 PASS。
3. 請 Cross 決定 AFT 門檻維持 17–21 歲固定挑戰或改實際年齡；之後補 JSON 匯入校驗與 PR 差距。修改時同步 README、mockup、`demos.js` 的 `MAP`、SW cache 版號，並測舊資料遷移。

## 必須保留的 project knowledge

- App 單一 `index.html`＋共用 `demos.js`，資料在此裝置 localStorage；匯出只生成文字供複製，匯入覆蓋資料。清除瀏覽器資料前必須備份。
- 新增或改名動作 → `demos.js` 的 `MAP`／`def` 與 SETUP 的 `VIDEOS` 都要補，否則訓練畫面只會顯示下一個動作。
- 週一／四肩、二／五腿、三拉＋加練、六恢復、日輪替測驗；預設有彈力帶，關掉用毛巾／徒手替代。L2 有帶週四主課表 22 分鐘，加一輪 33 分鐘，保底約 3 分鐘；跑步測驗另計。
- 體重趨勢須前後各 7 天讀數；近 3 日心率均值警示須 3 日讀數及至少 7 筆歷史。熱量公式是粗估起點，其他健康決策規則不是自動執行。
- 官方計分表：[AFT 2025 表](https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf)。17–21 歲男性 Plank 60 分是 1:30；不能重新引入 1:25。

新對話請先回覆「服務目標／當前階段／接下來要做」的三塊接手確認，再依最新 repo 與 Cross 的新指示行動。
