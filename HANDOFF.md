# Daily Ten — 下一個對話接手

> 截至 2026-09-28（Asia/Tokyo）。直接把本檔貼到新對話。先對照 repo 最新 `main`，不要用舊 PR 描述或這份快照覆蓋更新後的實作。

## 🎯 服務目標

Daily Ten 是個人訓練 PWA：降低每日出席門檻、依星期自動排十動作／加強／恢復／測驗，追蹤 streak、BODY 與三項自選 AFT 訓練目標。三項採男性 17–21 歲各 60 分門檻：HRP 15 下、Plank 1:30、2 英里跑 19:57。正式 AFT 有五項，App 不宣稱通過正式測驗。

## 📍 當前階段

- Repo：[crosswang-collab/daily-ten](https://github.com/crosswang-collab/daily-ten)，`main` 為唯一現行版本；先讀 [PROJECT_STATE.md](./PROJECT_STATE.md)、[README.md](./README.md)、`index.html`，再看 `mockup.html`。
- 已做：PWA、展示頁、週輪替課表、BODY、v1→v2 狀態遷移、彈力帶／徒手開關。這輪統一 1:30 門檻、約 3 分鐘保底、週日測驗另計、文件與器材文案；快取只清理 Daily Ten 自己的舊版。
- 現況界線：程式與本機驗證可確認行為；GitHub Pages 及 iPhone 安裝／離線／TTS 未在本輪真機驗證。沒有 CI。PR 差距尚不自動計算，匯入 JSON 校驗不足；畫面列出的部分睡眠／跑步規則是手動參考。

## ⏭ 下一步（依優先序）

1. 讀取最新 `main` 與本檔差異，檢查公開部署、iPhone 安裝、離線重開及備份／還原的完整使用流程；回報證據，不把推測當 PASS。
2. 請 Cross 決定：維持 17–21 歲男性三項門檻作固定挑戰，或改用實際年齡計分。未決定前不要改掉目前目標。
3. 若要繼續開發，優先補 JSON 匯入校驗與 PR 對門檻差距；修改時同步 README、mockup、manifest、Service Worker cache 版號，並測舊資料遷移。

## 必須保留的 project knowledge

- App 單一 `index.html`，資料在此裝置 localStorage；匯出只生成文字供複製，匯入覆蓋資料。清除瀏覽器資料前必須備份。
- 週一／四肩、二／五腿、三拉＋加練、六恢復、日輪替測驗；預設有彈力帶，關掉用毛巾／徒手替代。L2 有帶週四主課表 22 分鐘，加一輪 33 分鐘，保底約 3 分鐘；跑步測驗另計。
- 體重趨勢須前後各 7 天讀數；近 3 日心率均值警示須 3 日讀數及至少 7 筆歷史。熱量公式是粗估起點，其他健康決策規則不是自動執行。
- 官方計分表：[AFT 2025 表](https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf)。原先的 Plank 1:25 屬不同年齡組，17–21 歲男性 60 分是 1:30；不能重新引入。

新對話請先回覆「服務目標／當前階段／接下來要做」的三塊接手確認，再依最新 repo 與 Cross 的新指示行動。
