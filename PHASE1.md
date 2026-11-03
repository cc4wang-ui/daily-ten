# Phase 1（健身房 MVP，本地完成、未推 GitHub、未合併）

基準：PR #28 head 215a069 ＋ Phase 0（見 PHASE0.md）；權威規格 ~/workspace/daily-ten-complete.md §0。
工作目錄：~/workspace/daily-ten-dev（原複本 ~/workspace/daily-ten-pr28-fix 未改）。
範圍：只做 Phase 1，不做 Phase 2，不做任何 GitHub 寫入（無分支、無推送、無 PR、無合併）。

## 實作範圍（對照任務 9 項）
1. 健身房模板以 reel 為準：沿用 Phase 0 的 GYM_TEMPLATES（上肢 7 動作各 2 組、下肢 6 動作各 2–3 組），
   不發明 A/B 差異；templateForLabel 證明 Upper A＝Upper B、Lower A＝Lower B，順序名稱照走。
2. 序列引擎沿用 Phase 0：nextGym（完整課才推進，漏掉／改居家／最小課／散步都不推進），
   Upper A → Lower A → Upper B → Lower B；使用者自選健身房日，不固定星期。
3. 預填記錄：js/game/phase1.js 的 lastSetsFor＋prefillSets，健身房課自動帶入上次同動作的重量／次數，
   組數夾在模板 min–max 間；無紀錄時為空白組，使用者改數字即可開始。
4. 可暫停計時器：UI 單一組間計時器（複合 2:30、孤立 1:15），開始／暫停／繼續／重設；
   暫停時 tickRest 不扣秒，不是無法暫停的倒數。
5. 雙重漸進建議：progressionSuggestion，複合 6–10、孤立 10–15、保留 1–2 下餘力（由「動作順暢」勾選承載）；
   全組達範圍頂且動作好才建議加最小增量（上肢 2.5 kg、下肢 5 kg），否則先加次數；
   一次只回一種 action，絕不同時建議加重量、組數、天數（回傳物件無 sets／days 欄位）。
6. PR 清單：同一張表＋mode 欄位，顯示與計分分開（prsByMode／combinedPrList）；
   HRP（prs.hrp）與 push-up max（prs.pushup）分開存、分開比；第一次紀錄只是基準，不算新 PR；
   嚴格優於舊最佳才算新 PR；PR 仍非 XP。
7. 健身房達標率 x/4：weekGymAdherence 只計 phase0 gymLog mode gym；
   最小課、散步、居家、晨間伸展一律不計。
8. Plan 守門：validatePlanChange／applyPlanChange 只放行建議日（0–6，不固定星期）與同肌群互換；
   組數／動作庫／模板／其他一律拒絕且原 plan 不變，不做自訂課表 builder。
   互換語義＝同組兩動作位置對調（取代會造成同一動作重複出現，故不採用）；
   同肌群分組為保守分組（chest／back／posterior／quads 各有對調對象；側平舉、二頭、三頭、提踵、內收肌目前無對調對象）。
9. 疼痛旗標沿用 Phase 0：phase0.pain 當天有該動作 → 該列停用、progressionHeld 回 true、建議為 hold（進步暫停）。

## 資料與寫入分工（重要，避免重複計分）
- state.phase1：{ gymSets, prs（mode gym）, plan }；migrate 原樣保留不認得的欄位，Phase 1 不動 schema。
- Phase 1「儲存本課」只寫 phase1.gymSets 與 gym PR，不寫 session、不計 XP；
  完成整課、推進順序仍按 Phase 0 的「完成健身房課」（寫 session full＋gymLog）。
- 未動檔案：js/game/engine.js、js/game/rewards.js、data/game.json（XP／等級／d16 規則一律不變）。

## 改了哪些檔案
- 新增：js/game/phase1.js（純模組）、js/ui/phase1.js（首頁 #p1 面板）、tests/phase1.test.mjs、tools/redteam-phase1.mjs
- 修改：index.html（新增 #p1 section）、js/ui/home.js（呼叫 renderPhase1Panel）、sw.js（CACHE v32→v33、預快取加 2 檔）、css/app.css（#p1 樣式）
- 未動：engine.js、rewards.js、data/game.json、js/game/phase0.js、js/ui/phase0.js、所有既有測試

## 測試（見回報數字）
- node --test tests/phase1.test.mjs tests/phase0.test.mjs：13/13 通過（Phase 1 8 題＋Phase 0 5 題）
- tools/verify-rewards.mjs：all OK；node --check（phase1 兩檔＋home.js＋sw.js）通過；
  check-repo 通過（App 檔 100 個、預快取 101 項、CACHE daily-ten-v33）；glossary --ci 新增違規 0；
  redteam-phase1 7/7、redteam-phase0 all OK（6 項）。
- 完整 Playwright 套件：第一輪 1002 通過、49 跳過、5 失敗（皆為我方新面板的無障礙問題：
  動作順暢標籤與星期標籤觸控高度不足 44px，非既有測試期望過期）；
  修 CSS（兩種標籤 min-height 44px）後重跑：1007 通過、49 跳過、0 失敗，與 Phase 0 基準一致。
  既有測試未動。

## 未完成／需外部確認
- 教練簽核：健身房模板仍是草案，正式出貨前須教練驗證簽核（未簽核，不假裝已簽）。
- GitHub CI：未推分支，CI 未跑；v33 快取真機升級未驗。
- Phase 2（無障礙稽核、Strong／Hevy CSV 匯入、量測儀表板）未做。
