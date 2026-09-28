# Daily Ten — 下一個對話接手

> 截至 2026-09-28（Asia/Tokyo）。直接把本檔貼到新對話。**最高優先事項：找回 Cross 指出的 Codex 較新版（有影片、對標其他 App）並整合進 repo。** 本檔描述已核對的 GitHub 版，不能證明它是整個專案最新版。

## 🎯 服務目標

Daily Ten 是個人訓練 PWA：降低每日出席門檻、依星期自動排十動作／加強／恢復／測驗，追蹤 streak、BODY 與三項自選 AFT 訓練目標。三項採男性 17–21 歲各 60 分門檻：HRP 15 下、Plank 1:30、2 英里跑 19:57。正式 AFT 有五項，App 不宣稱通過正式測驗。

## 📍 當前階段

- Repo：[crosswang-collab/daily-ten](https://github.com/crosswang-collab/daily-ten)。先讀 [PROJECT_STATE.md](./PROJECT_STATE.md)、[README.md](./README.md)、`index.html`，再看 `mockup.html`。`main` 是已核對的 GitHub 版本，**不是已證實的最後 Codex 版本**。
- Cross 記得先前在 Codex 完成一版有影片且對標其他 App；目前未找到該對話或產物。GitHub 只有三個分支與四個 PR，最後功能 PR #3 於 2026-08-20 合併。現有「動作影片」僅是 YouTube 搜尋結果連結，repo 未見競品對標。
- 已做：PWA、展示頁、週輪替課表、BODY、v1→v2 狀態遷移、彈力帶／徒手開關。這輪統一 1:30 門檻、約 3 分鐘保底、週日測驗另計、文件與器材文案；快取只清理 Daily Ten 自己的舊版。
- 現況界線：程式與本機驗證可確認行為；GitHub Pages 及 iPhone 安裝／離線／TTS 未在本輪真機驗證。沒有 CI。PR 差距尚不自動計算，匯入 JSON 校驗不足；畫面列出的部分睡眠／跑步規則是手動參考。

## ⏭ 下一步（依優先序）

1. 從 Cross 提供的原 Codex 對話連結／匯出、工作區或版本檔找回較新版；核對時間與完整檔案。不要只憑「有影片、競品對標」重造一版並稱為恢復。
2. 與 GitHub `main` 做檔案及功能差異表，確認影片實際形式、來源與可用性，以及對標的 App、資料日期與產品決策；保留目前課表、BODY、localStorage 舊資料遷移，再整合到 repo 並更新文件。
3. 完成瀏覽器、公開部署、iPhone 安裝、離線重開及備份／還原驗證，明列未能驗證之處。其後再處理 AFT 年齡門檻、匯入校驗與 PR 差距。

## 必須保留的 project knowledge

- App 單一 `index.html`，資料在此裝置 localStorage；匯出只生成文字供複製，匯入覆蓋資料。清除瀏覽器資料前必須備份。
- 週一／四肩、二／五腿、三拉＋加練、六恢復、日輪替測驗；預設有彈力帶，關掉用毛巾／徒手替代。L2 有帶週四主課表 22 分鐘，加一輪 33 分鐘，保底約 3 分鐘；跑步測驗另計。
- 體重趨勢須前後各 7 天讀數；近 3 日心率均值警示須 3 日讀數及至少 7 筆歷史。熱量公式是粗估起點，其他健康決策規則不是自動執行。
- 官方計分表：[AFT 2025 表](https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf)。原先的 Plank 1:25 屬不同年齡組，17–21 歲男性 60 分是 1:30；不能重新引入。

新對話請先回覆「服務目標／當前階段／接下來要做」的三塊接手確認，再依最新 repo 與 Cross 的新指示行動。
