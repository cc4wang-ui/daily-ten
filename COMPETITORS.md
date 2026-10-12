# Daily Ten — 競品對標

## 2026-10-12 更新：訓練體驗優先

Cross 指出現有火柴人動作看不懂、YouTube 求助會打斷訓練、課表與 checkpoint 分散。原文下方 2026-09-28「以線條動畫為主體」的選擇已被使用者推翻，不再作為本輪產品決策。重整與發佈門檻見 [訓練重整路線圖](./docs/TRAINING-REBUILD-ROADMAP.md)。

| 參考來源 | 可核對的產品做法 | Daily Ten 要採取的原則 |
|---|---|---|
| [BetterMe App Store 官方介紹](https://apps.apple.com/us/app/betterme-well-being-coach/id1264546236) | 以目標、時間安排與器材條件提供居家訓練計畫；部分課程不需器材 | 問清器材條件，再給明確的今日課表；不複製冗長問卷或體態承諾 |
| [BetterMe 男性徒手訓練內容](https://betterme.world/articles/calisthenics-workout-for-men-2/) | 以程度和週計畫組織徒手動作 | 標明當天肌群與循序劑量；頁面內容不等於 App 實際效果或療效證據 |
| [GRIT Calisthenics 官方 Google Play 頁](https://play.google.com/store/apps/details?id=com.gritathletics) | 列出影片輔助訓練、目標旅程、進度統計與肌群圖 | 先完成可理解的動作影片及單一路徑，再做肌群圖和遊戲化；不讓 XP 取代實際進步 |
| [GRIT 官網](https://gritworkouts.com/) | 將訓練旅程、進度與每日課表放在清楚的路徑 | 今日首頁只有一個下一步；訓練畫面集中當前動作、下一步與求助 |

`betterme.men` 指的是使用者看到的男性徒手訓練廣告／網站；本輪無法直接核對該廣告頁的完整互動流程，上表僅採 BetterMe 可驗證的官方內容，不推測未看到的轉化漏斗細節。

整理：2026-09-28（Asia/Tokyo）。這是**新做的對標**，不是找回的 Codex 舊版（舊版未找回，見 [PROJECT_STATE.md](./PROJECT_STATE.md)）。

> **資料界線**：本表資料來自 2026-09-28 的網路搜尋摘要與評測文章（來源列在文末）。本工作環境連不到 App Store／YouTube，**價格與功能未在商店頁逐項核對**；標「未確認」的欄位不代表沒有該功能。做付費或對外決策前，先到商店頁再核一次。

## 對標表

| App | 動作示範形式 | 計畫／調整 | 習慣機制 | 費用（搜尋所得） | AFT 相關 |
|---|---|---|---|---|---|
| **Nike Training Club** | 教練真人影片帶練，每個動作都有示範 | 多種課程與計畫 | 未確認 | 免費 | 無 |
| **Seven – 7 Minute Workout** | **動畫人物**示範（不是真人） | 付費版依程度給個人計畫 | **連續天數 streak**、每日挑戰、成就、好友 | 免費＋「7 Club」訂閱（價格未確認） | 無 |
| **Freeletics** | 每個動作都有影片＋步驟說明（900+ 動作） | **AI 教練**依回饋調整 | 未確認 | 免費版有限；Coach 約 US$34.99／月或 US$99.99／年 | 無 |
| **ArmyFit** | AFT 各項目的**影片教學**＋文字說明 | 未確認 | 未確認 | 未確認 | AFT／CFT／腰身高比計分 |
| **Army Fitness Calculator** | 無 | 無 | 無 | 未確認 | 輸入成績算分 |
| **Daily Ten（本 App）** | **內建線條動畫**，離線可播，計次動作與節拍同步；另附 YouTube 搜尋連結 | 依星期自動排課、L1–L5 劑量、彈力帶／徒手切換 | streak、XP、保底約 3 分鐘 | 免費、無帳號 | 只追三項固定 60 分門檻（男性 17–21 歲） |

## 我們採用了什麼

| 競品做法 | Daily Ten 的決定 | 理由 |
|---|---|---|
| 每個動作在播放中都有示範（NTC、Seven、Freeletics 共通） | **採用**：訓練畫面中央播放當前動作；休息／準備時播「下一個」 | 這是三款主流 App 的共同底線；原本只有設定頁的 YouTube 搜尋連結，訓練中看不到 |
| 用動畫而非真人（Seven） | **採用**：自製線條人偶（`demos.js`），53 個動作 | 離線可用（PWA 核心承諾）、不需影片授權或主機、檔案小；計次動作的一輪對齊一下的節拍 |
| 真人影片（NTC、Freeletics） | **不採用為主體**，保留 YouTube 搜尋連結作補充 | 需要授權／主機，離線會失效；本環境也無法驗證特定影片 |
| streak 與每日挑戰（Seven） | 已有 | 維持低門檻出席：保底約 3 分鐘 |
| AI 依回饋調整課表（Freeletics） | **不採用** | 超出單檔 PWA 範圍；現行是規則式升級（7 日出席＋21 日內 PR 達標） |
| 好友競賽（Seven） | **不採用** | 無帳號、無雲端是刻意設計 |
| AFT 五項計分與年齡組（ArmyFit、Calculator） | **待 Cross 決定** | 目前只追三項、固定 17–21 歲門檻；是否改依實際年齡計分仍是開放決策 |

## 示範動畫的限制

- 線條人偶是依一般動作要領繪製，**未經教練或物理治療師審核**；側面圖看不到左右對稱與膝蓋內夾，提示文字補充要點。
- 部分動作簡化：俯臥 Y／T／W、雪天使、躺姿扭轉用俯視圖；90/90、鴿式、側平板的深度方向以縮短線段表示。
- 動畫不能檢查使用者自己的姿勢。首週建議搭配真人示範或鏡子確認。

## 來源（2026-09-28 搜尋）

- Nike Training Club：[Garage Gym Reviews 評測](https://www.garagegymreviews.com/nike-training-club-review)、[WhistleOut 評測](https://www.whistleout.com/CellPhones/Apps/nike-training-club-app-review)、[Nike 官方頁](https://www.nike.com/ntc-app)
- Seven：[App Store](https://apps.apple.com/us/app/seven-7-minute-workout/id650276551)、[Google Play](https://play.google.com/store/apps/details?id=se.perigee.android.seven&hl=en)
- Freeletics：[Cora 評測（2026）](https://www.corahealth.app/compare/freeletics)、[App Store](https://apps.apple.com/us/app/freeletics-workouts-fitness/id654810212)
- ArmyFit：[App Store](https://apps.apple.com/us/app/armyfit/id1438589226)、[Google Play](https://play.google.com/store/apps/details?id=com.acftapp.acftlite&hl=en_US)
- Army Fitness Calculator：[App Store](https://apps.apple.com/us/app/army-fitness-calculator/id1482254260)
