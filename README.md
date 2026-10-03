# Daily Ten

> 版本說明：Cross 記得的 Codex 版（含影片與競品對標）沒有找回。2026-09-28 決定把「動作示範」與「競品對標」當作**新功能重建**，不是恢復舊版。詳見 [PROJECT_STATE.md](./PROJECT_STATE.md) 與 [COMPETITORS.md](./COMPETITORS.md)。

以十動作為主幹的語音導引訓練計時器 + streak 追蹤器。可安裝的 PWA，已快取頁面可離線開啟。
專案目標：HRP 伏地挺身 / Plank / 兩英里跑達到 AFT 男性 17–21 歲的三項 60 分門檻（15 下 / 1:30 / 19:57）。這是自選的三項訓練目標，**不是正式 AFT 通過判定**：正式測驗共五項，且 App 未按使用者年齡調整。[門檻來源：美國陸軍 AFT 計分表（2025-06-01 生效）](https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf)。

預設器材：**一張瑜珈墊、一條彈力帶、一面牆**。
設定頁有「有彈力帶」開關；關掉後改用毛巾與徒手替代動作，適合出差沒帶彈力帶時。

## 課表結構

週一至五是「十動作＋一個加強區塊」；週六恢復、週日 Boss Day。區塊與伸展組由星期決定。
主課表時長由等級、日期及器材開關算出；例如週一有彈力帶時 L2 約 23 分鐘、L5 約 34 分鐘。週日顯示暖身時長，測驗另計。

| 日 | 內容 | 伸展組 |
|---|---|---|
| 一 · 四 | 十動作＋肩推鏈 | A／B |
| 二 · 五 | 十動作＋下肢後鏈 | B／A |
| 三 | 十動作＋拉系列與上背＋加練 | C |
| 六 | 恢復日：三組伸展全走，不做肌力 | C |
| 日 | Boss Day：十動作＋AFT 測驗 | A |

伸展組 **A** 髖與後鏈／**B** 胸肩與上背／**C** 全身流動，五個槽位固定、內容輪替。

首頁三種劑量是保底版（約 3 分鐘）、今日課表、加一輪加強區塊；另有雨天／出差室內有氧替代。

### 漸進超負荷

徒手靠**換槓桿**（派克 → 腳抬高派克 → 假直立 → 靠牆倒立肩推），
彈力帶靠**加張力**（縮短握距 → 疊帶 → 換磅數）。
兩者次數上限都鎖在 15，到了就換難度，不是做更多下。

彈力帶補掉的是徒手唯一練不到的兩塊：**拉**（划船、直臂下拉、面拉、開肩、肩外旋）
與**加載的垂直推**（肩上推、側平舉）。

## 動作示範

每個課表動作都有內建線條示範動畫（`demos.js`，53 個動作，離線可用）：

- **訓練中**：畫面中央播放當前動作並附一句要點；計次動作的一輪動畫對齊一下的節拍，暫停時一起停。休息、準備、換組時播「下一個」動作。
- **SETUP 頁**：每列有「示範」（開啟動畫）與「真人 ↗」（YouTube 搜尋結果，需連網）。

動畫是依一般動作要領繪製的示意，未經教練審核；首週建議搭配真人示範或鏡子確認姿勢。對標與取捨見 [COMPETITORS.md](./COMPETITORS.md)。

## 身體指標（BODY 頁）

體重 / 腰圍 / 靜息心率 / 睡眠每天記，圍度雙週，肌力檢測每月。
前後各 7 天都有體重紀錄時，App 以兩個 7 日均與腰圍方向判讀增重趨勢。心率警示使用近 3 天均值與歷史基線；其他規則（例如睡眠 3 天不足）是畫面上的手動參考，App 不會自動改課表或熱量。
巨量營養素以最新體重及 g/kg 計算；熱量以體重 kg × (33–37) + 250 kcal 作起點估算，需由後續趨勢校準。

## 檔案

| 檔案 | 用途 |
|------|------|
| `index.html` | App 外殼（只有 markup；無框架、無 build） |
| `css/tokens.css`、`css/app.css` | 設計 token 與樣式（M1 自 index.html 抽出，外觀不變） |
| `js/app.js`、`js/ui/*.js` | App 程式：開機、各畫面、計時引擎、課表（原生 ES modules） |
| `js/state/*.js` | 資料層：state v3、遷移、載入失敗保護、備份下載、匯入驗證 |
| `demos.js` | 動作示範動畫引擎與動作庫（App 與展示頁共用） |
| `mockup.html` | 展示用畫面示意頁（給沒裝過的人看，顯示首次啟動的空白狀態） |
| `manifest.webmanifest` | PWA 安裝設定 |
| `sw.js` | Service Worker，cache-first 離線快取 |
| `icon-192.png` / `icon-512.png` | App 圖示 |
| `COMPETITORS.md` | 競品對標與取捨 |
| `CLAUDE.md`、`PLAN.md`、`.claude/` | 開發指示、本版計畫、subagent 與流程定義 |
| `docs/ITERATION.md` | 每週迭代迴圈與 Cross 的輸入點（D22） |
| `PROJECT_STATE.md` | 進度、架構、決策、踩坑與待辦的單一專案紀錄 |
| `HANDOFF.md` | 下一個對話的精簡接手指令 |
| `package.json`、`playwright.config.js`、`tests/` | 自動測試（僅開發用；App 執行不需要） |
| `tools/` | 開發工具：本機伺服器 `serve.mjs`、台灣用語檢查 `jev/` |
| `.github/` | CI（GitHub Actions）與 repo 檢查腳本 |
| `reports/` | 驗收與文案報告 |

## 部署到 GitHub Pages（5 步）

1. 這個 repo 已是 `cc4wang-ui/daily-ten`。
2. GitHub 網站 → **Settings** → **Pages**。
3. **Build and deployment → Source** 選 **Deploy from a branch**。
4. **Branch** 選 `main`、資料夾 `/ (root)`，按 **Save**。
5. 等 1–2 分鐘，網址為 `https://cc4wang-ui.github.io/daily-ten/`。

## 展示給別人看

`https://cc4wang-ui.github.io/daily-ten/mockup.html` — 展示頁，包含首次啟動狀態及其他情境示意、一週節奏與五級劑量。畫面為示意，訓練與紀錄以 App 即時資料為準。

## iPhone 安裝

Safari 開啟 App 網址 `https://cc4wang-ui.github.io/daily-ten/`（不是 `mockup.html`）→ 分享鈕 → **加入主畫面** → 從主畫面圖示開啟。GitHub Pages 必須先啟用。

## 更新 App

**使用者不用做任何事**：新版上線後，App 在開啟或從背景切回時自動檢查，閒置時自動換成新版（訓練中不打斷），換完會短暫顯示「已更新到最新版」；SETUP 最下方顯示目前的 App 版本（D23）。離線時會在下次連線後更新。

開發者：改了 App 檔就把 `sw.js` 的 `CACHE = 'daily-ten-vN'` +1，新增的 App 檔加進 `ASSETS`（CI `check-repo` 會比對 main 檢查兩者）。
App 改用 ES modules，必須透過 http(s) 開啟（GitHub Pages 或 `npm run serve`），不能直接雙擊 `index.html`。

## 開發與測試（給開發者）

`npm ci` → `npm test`（Playwright：資料層單元測試＋e2e）。另有 `npm run check:repo`（失效網址、SW 預快取、前端掃描）與 `npm run check:glossary`（台灣繁中用語表）。每次 push 由 GitHub Actions 跑同一套。

## 備份

資料只存在這台裝置的 localStorage，沒有雲端。

- **下載備份**：SETUP → 資料備份 →「下載備份」，存成 `daily-ten-backup-YYYY-MM-DD.json`。iPhone 會跳出分享選單 →「儲存到檔案」。超過 7 天沒備份（或從未備份），首頁會出現提醒卡，一鍵就能下載。
- **匯入**：「選擇備份檔匯入」或把 JSON 貼進文字框後按「匯入」。App 先驗證格式，壞檔只會顯示錯誤、不動現有資料；通過後先顯示「目前／匯入後」差異預覽，要按兩次確認才會覆蓋。
- **載入失敗保護**：資料讀不出來或格式異常時，原始內容會另存一份並在首頁顯示錯誤卡，可下載保存，App 不會白屏。
- 「匯出 JSON」（文字框複製）仍保留。
