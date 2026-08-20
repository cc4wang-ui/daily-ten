# Daily Ten

每日固定十動作的語音導引訓練計時器 + streak 追蹤器。可安裝的 PWA，離線可用。
終點線：AFT 居家三項（HRP 伏地挺身 / Plank / 兩英里跑）達及格 60 分。

器材只需要**一張瑜珈墊、一面牆、一條毛巾**。

## 課表結構

每天都是「十動作＋一個加強區塊」，區塊與伸展組由星期決定 —— 使用者不做選擇。
時長由當前等級的劑量算出（L2 約 20 min、L5 約 31 min），不是寫死的。

| 日 | 內容 | 伸展組 |
|---|---|---|
| 一 · 四 | 十動作＋肩推鏈 | A／B |
| 二 · 五 | 十動作＋下肢後鏈 | B／A |
| 三 | 十動作＋拉系列與上背＋加練 | C |
| 六 | 恢復日：三組伸展全走，不做肌力 | C |
| 日 | Boss Day：十動作＋AFT 測驗 | A |

伸展組 **A** 髖與後鏈／**B** 胸肩與上背／**C** 全身流動，五個槽位固定、內容輪替。

首頁三顆按鈕是下限／預設／上限：保底版 2 分鐘、今日課表、加一輪加強區塊。

## 身體指標（BODY 頁）

體重 / 腰圍 / 靜息心率 / 睡眠每天記，圍度雙週，肌力檢測每月。
7 日均與週變化率算出「精瘦增肌中 / 增脂偏快 / 停滯」的判讀，
每條指標都綁一條決策規則（例如 7 日均 3 週沒動 → +150 kcal）。
營養目標以 g/kg 從最新體重直接算成克數。

## 檔案

| 檔案 | 用途 |
|------|------|
| `index.html` | 整個 App（inline CSS/JS，無框架、無 build） |
| `mockup.html` | 展示用畫面示意頁（給沒裝過的人看，示範假資料） |
| `manifest.webmanifest` | PWA 安裝設定 |
| `sw.js` | Service Worker，cache-first 離線快取 |
| `icon-192.png` / `icon-512.png` | App 圖示 |

## 部署到 GitHub Pages（5 步）

1. 這個 repo 已是 `crosswang-collab/daily-ten`。
2. GitHub 網站 → **Settings** → **Pages**。
3. **Build and deployment → Source** 選 **Deploy from a branch**。
4. **Branch** 選 `main`、資料夾 `/ (root)`，按 **Save**。
5. 等 1–2 分鐘，網址為 `https://crosswang-collab.github.io/daily-ten/`。

## 展示給別人看

`https://crosswang-collab.github.io/daily-ten/mockup.html` — 一頁看完所有畫面、
一週節奏、五級劑量與離 AFT 及格線的距離。桌機／手機都可讀，跟隨系統深淺色。

## iPhone 安裝

Safari 開上面網址 → 分享鈕 → **加入主畫面** → 從主畫面圖示開啟（standalone 全螢幕）。

## 更新 App

改完 code 後：把 `sw.js` 裡的 `CACHE = 'daily-ten-vN'` 版本號 +1，commit 推上去。
舊快取會在下次開啟時自動清除、載入新版。

## 備份

App 內 Setup 頁 → Export JSON。還原用 Import。資料存在裝置 localStorage，零維護。
