# Daily Ten — Project State

更新：2026-10-02（Asia/Tokyo，M1 地基）。本檔描述 GitHub repo 的現況；開發原則、決策 D1–D21 與 Milestones 以 [CLAUDE.md](./CLAUDE.md)、[PLAN.md](./PLAN.md) 為準。Cross 記得的 Codex 版（有影片、對標其他 App）**沒有找回**；2026-09-28 Cross 決定把兩者當作**新功能重建**（內建示範動畫＋[COMPETITORS.md](./COMPETITORS.md)），不稱為恢復舊版。若日後找到舊版，只當參考比對，不覆蓋現有實作與資料遷移。部署狀態、個人訓練成果及真機表現若無證據，一律視為未驗證。

## 版本來源與待找回產物

| 來源 | 已確認內容 | 界線 |
|---|---|---|
| GitHub repo（2026-09-28） | 內建示範動畫（`demos.js`）、訓練畫面與 SETUP 動作庫、`COMPETITORS.md`。 | 新做的功能，不是舊 Codex 版的恢復。 |
| Cross 指出的先前 Codex 開發對話 | Cross 記得做過有影片、對標其他 App 的版本。 | 未找回（GitHub 五個 PR、Drive 搜尋皆無）。Cross 已決定重建，不再以找回為前提。 |

## Project goal

建立一個低摩擦、可安裝且可離線開啟的個人訓練 PWA：用星期自動選課、語音／提示音計時、最低劑量維持出席習慣，記錄 streak、XP、身體指標及測驗成績。訓練同時兼顧增肌與跑步，不盲目增加體重。

專案自選的數字終點線是美國陸軍 AFT **男性 17–21 歲**計分表中三項各 60 分：HRP 15 下、Plank **1:30**、2 英里跑 **19:57**。[官方計分表（2025-06-01 生效）](https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf)。正式 AFT 有五項；本產品只追其中三項，L5 或三項達標都不代表正式測驗通過。App 未依年齡切換門檻。

## Verified facts

- **現行產物**：無框架、無 build 的 PWA。`index.html` 只剩 markup；樣式在 `css/tokens.css`＋`css/app.css`；程式是原生 ES modules：`js/app.js`（開機）、`js/ui/*.js`（各畫面、計時引擎、課表）、`js/state/*.js`（資料層）。`demos.js` 是 App 與展示頁共用的示範動畫（classic script）；`mockup.html` 是靜態展示，不讀取使用者紀錄。`sw.js` 快取 v6，預快取全部 App 檔（CI 檢查清單完整）。repo 有 Playwright 測試與 GitHub Actions CI（M1 起）。
- **動作示範**：53 個線條動畫，涵蓋所有課表步驟（L1–L5 × 有帶／無帶 × 三組伸展 × 三種區塊 × 加練／恢復／保底／雨天）。步驟名稱以 `DT_DEMOS.keyFor()` 的關鍵字表對應，順序敏感（例：「深蹲蹲坐」「靠牆深蹲」要排在「深蹲」前）。計次動作的動畫週期 = tempo 秒；休息／準備／換組播下一個動作。SETUP 保留 YouTube 搜尋連結當「真人」補充。
- **狀態**：`daily-ten-state` 存在裝置 localStorage；若環境提供 `window.storage`，程式也嘗試讀寫（D14，M3 評估移除）。M1 起為 **state v3**：保留 v2 全部欄位（level、XP、streak、sessions、六種 PR、七種 body、profile、設定），新增 `habits.sleep/explore`（預設探索項目 DJ）、`goals`（身分宣言）、`phase`（P1）、`game`、`meta.lastBackupAt` 與就寢／起床設定，數值留給 M2a。v1／v2 載入時遷移，冪等；`game` 物件存在即視為已遷移（D12）。M1 期間 legacy `xp`、`streak` 仍是真實來源，每次存檔**複製**到 `game`（不累加）。讀不出來或格式異常 → 原始字串另存 `daily-ten-state.bak-v{N}`、首頁錯誤卡可下載，不白屏。備份：「下載備份」存成 `.json`（iPhone 走分享選單），7 天未備份首頁提醒；匯入：驗證 → 差異預覽 → 兩次確認，壞檔不動現有資料，覆蓋前另存 `daily-ten-state.pre-import`。
- **一週節奏**：週一／四肩推，週二／五下肢，週三拉與加練，週六三組伸展恢復，週日十動作暖身後輪替 HRP／Plank／跑步測驗。A/B/C 伸展組依日輪替。預設有彈力帶；關閉後切回毛巾／徒手替代。
- **劑量**：L1–L5 改變組數、次數與時間；主課表時長由序列計算。L2 有彈力帶週四 22 分鐘、加一輪 33 分鐘；保底版目前各級約 3 分鐘。週日只預估十動作暖身，測驗時間另計，尤其戶外 2 英里跑。
- **紀錄與判讀**：同日重練可把 session 升級為較高 XP，不重複累積 streak；升級需最近 7 日都有 session，且近 21 日任一 AFT PR 達該級門檻。體重趨勢需前後各 7 日有紀錄；心率警示需近 3 日讀數及歷史至少 7 筆。睡眠、PR 停滯、跑步退步等規則目前只是畫面上的手動參考，沒有自動調整課表或熱量。熱量是體重 kg × (33–37) + 250 kcal 的起點估算，不是測得的 TDEE。

## General rules / decisions

1. `index.html` 的實際行為是產品事實；改演算法、時間或文案時，同步檢查 README、mockup、manifest 與 Service Worker 快取版本。
6. **新增或改名課表動作時**，要在 `demos.js` 的 `MAP` 對應一個示範（或新增 `def`），並在 SETUP 的 `VIDEOS` 加一列；否則訓練畫面會退回顯示下一個動作。
7. 示範動畫只是示意，不宣稱經專業審核；競品資料要標日期與來源，未在商店頁核對的欄位標「未確認」。
2. `mockup.html` 只展示空白狀態及獨立的中斷／測驗情境；不可把示意畫面當成真實個人紀錄。固定數字要標示對應 level、星期、器材，或明說只是示意。
3. 不把「三項訓練目標」寫成「正式 AFT 通過」，也不把男性 17–21 歲標準冒稱為使用者當前年齡的標準。若要改終點線，先決定目標年齡與用途，再查官方現行表。
4. 一次只記錄當天一個 session 的最高 XP；localStorage 沒有雲端同步。任何可能清除儲存資料的變更，先驗證舊資料遷移與匯入回復。
5. 不以「已通過測試」替代真機安裝、離線重開及實際使用驗證；證據要標明日期與環境。
8. App 檔新增或改名 → 同步 `sw.js` 的 `ASSETS` 並把 CACHE 版號 +1（CI `check-repo` 會擋漏列）。ES modules 必須經 http(s) 開啟，不能用 file://。
9. 資料結構變更必須走 `js/state/`（schema 版本＋遷移步驟＋舊資料 fixture＋單元測試），由 data-guardian 負責；UI 只透過 `store.js`／`backup.js` 的 API 存取 state。

## Completed work

| 時間 | 已合併的工作 | 證據 |
|---|---|---|
| 2026-07-11 | v0.1 App 加入 PWA manifest、Service Worker、圖示。 | commit `addc5be` |
| 2026-08-17 | 加入獨立展示頁。 | PR #1 |
| 2026-08-20 | 加入週輪替加強區塊、BODY 指標、營養估算、state v1→v2 遷移。 | PR #2 |
| 2026-08-20 | 預設彈力帶，加入無帶切換及拉／肩推／後鏈動作；展示頁改為空白資料。 | PR #3，合併後 `main` 為 `e7eda111` |
| 2026-09-28 | 核對 GitHub 當時的程式與文件，修正展示／時長／AFT 門檻文案，補資料充足條件與限定快取清理範圍；建立本檔與 handoff。 | PR #4、`789b1af`；只代表 GitHub 版 |
| 2026-09-28 | 追查 Codex 影片／競品版未果，標註來源缺口。 | PR #5、`37dd40e` |
| 2026-09-28 | 重建為新功能：`demos.js` 53 個離線示範動畫、訓練畫面同步播放、SETUP 示範視窗、展示頁動畫、`COMPETITORS.md`；SW 快取 v5。 | PR #6、`ec87e03` |
| 2026-10-02 | 專案指示檔（CLAUDE.md、PLAN.md、`.claude/`）進 repo；README／HANDOFF 改為 `cc4wang-ui` 網址（D10、D11）。 | PR #7、`8261c3f` |
| 2026-10-02 | **M1 地基**：拆 ES modules＋設計 token（行為零變更）、state v3＋遷移、載入失敗保護、備份下載＋7 天提醒、匯入驗證／預覽／二次確認、台灣用語表檢查、Playwright＋CI、SW v6。 | 分支 `m1/foundation`；驗證見下 |

## Lessons learned / pitfalls

| 坑 | 已採取的處理 |
|---|---|
| 初期 15 分鐘徒手方案的拉與可加載垂直推不足，增肌劑量偏低。 | PR #2 增加週區塊與 2–3 組；PR #3 引入彈力帶與替代開關。 |
| mockup 曾使用虛構 streak／PR，容易被誤認為真實進度。 | PR #3 清空假紀錄；保留中斷與測驗的獨立情境示意。 |
| 文件寫保底 2 分鐘、週日跑步只估 3 分鐘、Plank 表寫 1:25；與現行序列／官方門檻衝突。 | 保底改依序列顯示約 3 分鐘；週日只報暖身時間；Plank 統一 1:30。 |
| Setup 舊文案仍稱器材只有毛巾；manifest 仍稱徒手。 | 與預設彈力帶及無帶替代模式對齊。 |
| Service Worker 原本會刪除同源的所有其他 cache。 | 僅清除 `daily-ten-v*` 舊版本；本次快取版號 v4。 |
| 健康規則文字說「連續 14 天／連 3 天」，舊判讀對零星資料也可能給結論。 | 體重兩個 7 日區間各需 7 筆；心率近 3 日需 3 筆、歷史需至少 7 筆，文案說明是均值。 |
| 把 GitHub `main` 當成所有 Codex 工作的最後版本，漏掉 Cross 記得的影片／競品版本。 | 撤回「唯一最新版」的說法；找不回後由 Cross 決定重建為新功能，文件明寫不是恢復。 |
| 內嵌 YouTube 影片會破壞離線承諾，且本環境無法驗證特定影片存在。 | 改用自製線條動畫；YouTube 只留搜尋連結。 |
| SVG `vector-effect` 不會從 `<g>` 繼承，縮放後線條變粗。 | CSS 寫在 `.dm-fig *`。 |
| 舊匯入流程遇到格式錯誤的檔案，會把 `null` 寫進 localStorage（等於資料遺失）。 | M1 改為先驗證、預覽差異、兩次確認才覆蓋；壞檔只顯示錯誤，覆蓋前另存 pre-import。 |
| 舊版 SW 快取的 App 讀到 v3 會把 `version` 改回 2，再記一次訓練。 | 以 `game` 物件判斷已遷移；legacy→game 用複製不用累加（fixture `v3-reverted-to-v2`：XP 406，不是 802）。 |
| 拆成多個 module 後，預快取少列一個檔，離線冷啟動就會缺 module。 | CI `check-repo` 比對 `ASSETS` 與實際檔案；SW install 用 `cache:'reload'` 避免新 HTML 配到舊 module；開機包 try/catch，module 載入失敗顯示啟動失敗卡、不白屏。 |
| 匯入的「確認匯入」快速點兩下會一次套用，二次確認形同虛設（qa-checker 第 1 輪發現）。 | 第一次按後 1 秒內的點擊一律忽略，超過 1 秒、10 秒內再按才套用；外觀不變。 |
| PR #0（指示檔）尚未 merge 就開始 M1。 | M1 分支疊在 PR #0 分支上；Cross 授權後由 Claude merge PR #7，M1 PR 對 main 的 diff 只含 M1。 |
| 用 symlink 共用 `node_modules` 時，`.gitignore` 的 `node_modules/` 不會排除 symlink。 | 改成 `node_modules`（不加斜線）。 |
| Playwright 截圖比對的雜訊：fake clock 會讓兩個分頁的動畫相位不同、fullPage 截圖固定分頁列會飄、圓角有 ±1 像素差。 | 載入後先對齊時間、逐屏截圖再拼接、Chromium 加 `--disable-partial-raster`；同版本自比 0 px 後才拿來比對。 |

## Open failures / unverified

- **示範動畫品質**：依一般動作要領繪製，未經教練／物理治療師審核；90/90、鴿式、側平板、俯臥 Y/T/W 等為簡化視角。請 Cross 在真機逐一看過，標出看不懂或不對的動作。
- **競品資料**：來自 2026-09-28 搜尋摘要；App Store／YouTube 在本環境被擋，價格與功能未在商店頁逐項核對。
- **部署與真機**：GitHub Pages 已啟用（Actions「pages build and deployment」在 `main` 部署成功，2026-10-02）；但本環境 proxy 擋 github.io，公開網址能否載入、iPhone Safari 加入主畫面、離線重開、TTS、分享選單「儲存到檔案」仍待 Cross 真機確認（見 M1 PR 真機清單）。
- **測試基礎**：M1 起有 Playwright（資料層單元測試＋e2e）與 GitHub Actions CI；CI 的「拆 module 前後等價比對」以 `ec87e03` 為基準，**M2a 起畫面會刻意改變，需移除或改基準**。自動測試不等於真機驗證與長期訓練成效。
- **產品範圍決策**：是否繼續使用 17–21 歲男性三項門檻作個人挑戰，或改依實際年齡顯示官方分數，需使用者決定。正式 AFT 的另兩項未實作。
- **已知功能缺口**：PR 畫面只顯示成績與固定門檻，沒有自動算差距；睡眠與跑步退步規則沒有自動執行；L5 是 App level，非三項全達標。
- **資料韌性**：M1 已補匯入驗證、差異預覽、兩次確認、備份下載、載入失敗保護與 fixture 測試；仍無雲端備份（原則 1：不做）。未來時間的 `lastBackupAt`（裝置時鐘錯）會讓提醒延後到該時間。
- **減少動態效果**：示範動畫沒有依 `prefers-reduced-motion` 調整（既有行為，M1 未改），M3 處理。
- **既有用語**：用語表檢查列出 2 筆既有違規（SETUP「時長」、Boss 完成畫面「數據」），依 PLAN.md 屬外觀變更，M3 修正。
- **身體建議**：熱量／訓練文字是一般性的產品假設，不是個人醫療或營養評估；本次只核對內部一致性，沒有臨床驗證。

## 驗證紀錄 — 2026-09-28（本機 Chromium，非真機）

Playwright＋Chromium 1194、375×667 視窗、本機 HTTP：v1 舊資料遷移後 streak 保留；所有課表步驟都有示範（缺 0）；SETUP 每列都有示範；準備步驟顯示 NEXT；第一個動作動畫會動、暫停會停、結束後動畫迴圈清除；示範視窗開關正常、保留 YouTube 連結；SW v5 快取含 `demos.js`，離線重載後示範仍在；HRP 測驗畫面顯示 HRP 示範；無頁面錯誤。展示頁載入無錯誤。**未驗證**：iPhone Safari 安裝、真機離線、TTS 與動畫同時跑的耗電與流暢度、GitHub Pages 公開網址。

## 驗證紀錄 — 2026-10-02（M1；本機 Chromium＋GitHub Actions，非真機）

資料層單元測試 200 項（fixture：v1、v2 真實、v2 缺欄位、v2 型別錯、空陣列、v3、被改回 v2、壞 JSON、四種壞匯入檔）；拆 module 前後與 `ec87e03` 截圖比對（ui-engineer 自測 233＋237 張，除 SETUP 資料備份卡外 0 px）；用語表 self-test 108 項、新增違規 0；`check-repo`（失效網址、SW v6 預快取、前端掃描）通過。qa-checker 獨立驗收：第 1 輪 PASS（266 passed／0 failed，含 e2e 66 項：遷移、訓練全流程、匯入壞檔、備份與提醒邊界、載入失敗、離線、main SW v5→v6 升級路徑、與 `ec87e03` 像素比對 0 px；植入 15 個缺陷全部抓到），GitHub Actions 第 4 次執行同一套全綠；第 2 輪驗收連點保護，見 `reports/qa-m1-*.md`。**未驗證**：iPhone 真機全部項目。

## Last session — 2026-10-02

M1 地基：PR #7（指示檔＋網址）由 Claude 依 Cross 授權 merge；`m1/foundation` 完成 module 拆分、state v3、備份／匯入、用語表檢查、CI。接續：① Cross merge M1 並跑真機清單；② M2a 開工前確認起床／就寢目標（U2，預設 07:00／23:00）；③ M2a：engine、早安打卡、D6/D18/D19、P1→P2、每週／季度目標、`.ics`、sim。先讀 `HANDOFF.md` 再動工。
