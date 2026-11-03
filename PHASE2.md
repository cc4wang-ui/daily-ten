# Phase 2（無障礙＋Strong／Hevy 匯入＋量測儀表板，本地完成、未推 GitHub、未合併）

基準：PR #28 head 215a069 ＋ Phase 0（PHASE0.md）＋ Phase 1（PHASE1.md）；權威規格 ~/workspace/daily-ten-complete.md §0。
工作目錄：~/workspace/daily-ten-dev（原複本 ~/workspace/daily-ten-pr28-fix 未改）。
範圍：只做 Phase 2，順序為無障礙 → 匯入 → 儀表板；不做任何 GitHub 寫入（無分支、無推送、無 PR、無合併）。
不做（硬性）：社交、AI 教練／內容生成、營養、穿戴同步、原生 App、付費訂閱、第二種貨幣、
傷害／扣血文案、自訂課表 builder（Plan 頁仍只能改建議日與同肌群 swaps）。

## 1. 無障礙稽核與修復（先做）
稽核方法：對照 tokens.css 的對比註記逐一驗算（亮色文字皆 ≥4.5:1：次要字 #5F635C 6.13:1、
分頁未選 #6B6F68 5.12:1、支柱加深色 5.40–6.51:1、深墨按鈕白字 16.2:1），並全站盤點互動目標高度。
- 對比：無需改色。#app 內的 --amber 已改指向 --move-ink（5.54:1），故 .vid-ready 在亮色畫面亦達標；
  暗色訓練畫面的琥珀字在深底上亦達標；焦點框早有 #app :focus-visible（2px sleep-ink 描邊）。
- 觸控 44pt：全站按鈕／分頁／開關本已 ≥44px；本次補齊剩餘缺口：Phase 0 疼痛按鈕
  （原 padding 6px＋12px 字，約 30px → min-height 44px）、所有 select
  （Phase 1 互換選單原無 min-height → #app select min-height 44px）、動作影格 range 滑桿、
  訓練控制列按鈕（.t-ctrl button min-height 44px）。Phase 1 已修的兩種標籤（.p1-good／.p1-day）維持 44px。
- 語義：Phase 2 新增的進度條用 role=progressbar＋aria-valuenow，匯入的檔案／單位／貼上欄位皆有 label，
  錯誤區 role=alert、結果區 role=status；統計新增的「進度」分段為 role=tabpanel＋aria-labelledby。
- 200% 放大：index.html 拿掉 user-scalable=no（原先鎖縮放，違反 WCAG 1.4.4）；CSS 加
  min-width:0／換行／340px 以下堆疊（KPI、tiles、力量證據），375px 既有版面不受影響。
- Reduce Motion：全站 keyframes 只動 transform／opacity（ring-sweep、toast-in、cele-pop、cf-fall、p0-pop）；
  既有 prefers-reduced-motion 分項規則保留（改為淡入或停用）。Phase 2 不新增任何動畫。
  教訓：第一版曾加 `*` 全域 transition-duration 規則，導致資料保護元素的 transitionDuration 不為 0，
  違反 repo 的 reduced-motion 測試契約，第一輪全套件因此失敗 3 題；已刪除該全域規則，
  並在 tests/phase2.test.mjs 加回歸防線（禁止全域 transition-duration、@keyframes 總數維持 6 個）。

## 2. Strong／Hevy CSV 匯入（再做）
- 純模組 js/game/phase2.js：parseImportCsv（Strong：Date／Workout Name／Exercise Name／Set Order／
  Weight／Reps；Hevy：title／start_time／exercise_title／set_index／set_type／weight_kg／reps，
  亦接受 Weight (kg)／Weight (lb)／weight_kg／weight_lbs 等標題變體與 YYYY-MM-DD／YYYY/MM/DD／
  MM/DD/YYYY 日期）。重量一律轉 kg（lb × 0.45359237，到小數 1 位）；徒手組重量空白視為 0 kg；
  Hevy 熱身組與只有距離／時間的非肌力列計數跳過（不靜默丟失）；其餘不合規列逐列報錯（列號＋原因）。
- 格式不符明確報錯、絕不寫入：無法辨識標題、缺少日期／動作／重量／次數欄位、只有標題列、
  空檔、引號未閉合、列數 >20000 時 ok=false、entries 為空；Strong 檔未標單位且未選單位時，
  該列報「重量單位不明」，不猜單位（UI 提供 kg／lb 選擇）。
- 去重：mergeImportedSets 以「日期＋動作＋重量＋次數」多重集合為指紋（不含組序），
  同一檔案重匯一次新增 0 組；部分重疊時只新增未曾出現的組數；不改動輸入陣列。
- 餵給 Phase 1：匯入寫入 phase1.gymSets（{date, label:'', exercise, sets:[{weight, reps}]}，weight 為 kg），
  故 lastSetsFor／prefillSets 直接吃到匯入紀錄；PR 由 applyImportPrs 沿用 Phase 1 規則
  （mode gym、第一次只是基準、嚴格優於舊最佳才算新 PR；體重 0 的徒手組不產生重量 PR）。
  HRP（prs.hrp）與 push-up max（prs.pushup）分開存、分開比，匯入不動它們。
- 匯入本身不計 XP、不寫 session、不改既有 session 的計分；匯入紀錄記入 state.phase2.imports
  （格式、新增／重複組數、日期範圍）供稽核。UI 在統計的進度分段（#p2），兩步流程：
  「解析預覽（先看結果，不寫入）」→「確認匯入」；首頁不新增任何匯入入口或文案。

## 3. 量測儀表板（只放 Progress 頁）
- 位置：統計新增「進度」分段（#s-progress／#p2，js/ui/phase2.js 由 renderStats 渲染）；
  首頁仍只顯示健身房達標率 x/4 與本週 Perfect Day X/5 兩條進度，未新增第三條。
- 28 天活動率：最近 28 個日曆天有活動的天數／28；活動日＝session（排除 rest 恢復日）
  或 phase0 gymLog（gym／home／minimum／walk 皆計）；分母固定 28 天，暫停日不偷偷扣掉，另列暫停天數。
- 量趨勢（分開看）：健身房量＝phase1 gymSets 的 Σ重量(kg)×次數，分 4 週列出；
  居家量＝game.trainingFeedback 的 Σ實際次數（單位：下），分 4 週列出；兩者絕不合併，
  居家量絕不換算成 kg（彈力帶阻力標記本來就不能換算公斤）。
- 睡眠趨勢：body.sleep（v 小時）優先，缺漏時以 habits.sleep.log 的熄燈→起床時數補，
  同一天以 body 為準；顯示 28 天平均、紀錄天數、最近一筆與 4 週平均，無資料時明說資料不足。
- Day-30 回訪率改為滾動觀察：儀表板顯示滾動 30 天活動率（最近 30 天有活動天數／30），
  並註明「僅為滾動觀察，非同批回訪率驗證結論，不設 4 週內驗完的硬門檻」。
- 砍功能門檻統一為每週使用率低於 10%：儀表板與本文件註明即可，本版不刪除任何現有功能。

## 改了哪些檔案
- 新增：js/game/phase2.js（純模組）、js/ui/phase2.js（進度分段 #p2）、tests/phase2.test.mjs、tools/redteam-phase2.mjs
- 修改：index.html（viewport 拿掉 user-scalable=no；統計新增進度分段按鈕＋#s-progress／#p2）、
  js/ui/stats.js（renderStats 加 renderPhase2Panel）、js/app.js（onScreen s-progress）、
  css/app.css（Phase 2 無障礙修復＋#p2 樣式）、sw.js（CACHE v33→v34、預快取加 2 檔）
- 未動：js/game/engine.js、js/game/rewards.js、data/game.json（XP／等級／d16 規則一律不變）、
  js/ui/home.js（首頁仍只有兩條進度）、js/game/phase0.js、js/game/phase1.js、所有既有測試

## 測試（見回報數字）
- node --test tests/phase2.test.mjs tests/phase1.test.mjs tests/phase0.test.mjs：21/21 通過
  （Phase 2 8 題＋Phase 1 8 題＋Phase 0 5 題）
- tools/verify-rewards.mjs：all OK；node --check（所有改動的 js）通過；
  check-repo 通過（App 檔 102 個、預快取 103 項、CACHE daily-ten-v34）；
  redteam-phase2 6/6、redteam-phase1 7/7、redteam-phase0 all OK（6 項）。
- 完整 Playwright 套件第一輪：1004 通過、49 跳過、3 失敗（總數 1056，與 Phase 1 基準 1007／49／0 一致，
  差額即此 3 題）。3 題皆為 reduced-motion 契約失敗，皆由 Phase 2 第一版的全域 transition-duration
  規則造成（auto-update 884、reduced-motion 271、reduced-motion 303），非既有測試期望過期，
  故不動既有測試，改刪全域規則修復。針對性重跑：reduced-motion 全檔 8/8、auto-update 該題 1/1，
  皆通過。第二輪全套件重跑：1007 通過、49 跳過、0 失敗，與 Phase 1 基準完全一致。
  另以 Playwright 探針驗證 200% 根字體放大：#app 無橫向溢出（scrollW＝clientW＝375），
  統計的進度分段可正常渲染（探針為 /tmp 暫存腳本，不進 repo）。

## 未完成／需外部確認
- 教練簽核：健身房模板仍是草案，正式出貨前須教練驗證簽核（未簽核，不假裝已簽）。
- GitHub CI：未推分支，CI 未跑；v34 快取真機升級未驗。
- 滾動 30 天數字僅為滾動觀察，不是已驗證的回訪率結論；砍功能門檻僅註明，未實際評估任何功能的使用率。
