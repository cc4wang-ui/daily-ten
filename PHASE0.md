# Phase 0（開發中，未推上 GitHub，未稱完成）

基準：PR #28 head 215a069；權威規格 ~/workspace/daily-ten-complete.md §0。
工作目錄：~/workspace/daily-ten-dev（自 ~/workspace/daily-ten-pr28-fix 複製，原複本未改）。

## 實作範圍（只做 Phase 0）
- Today 新面板（首頁 `#p0`，js/ui/phase0.js）：健身房日使用者自選、順序 Upper A → Lower A → Upper B → Lower B、
  漏掉／改居家保留序位不補雙倍、一鍵 home↔gym 互換、每天最多 1 個 Movement 額度（靠既有 moveDays 取最高）。
- 寬容連續：暫停 Rest/Sick/Travel（當日宣告）優先，暫停日不耗 Freeze、不計連續／Perfect Day／28 天分母；
  Freeze 只補非暫停意外缺席日，每 7 個實際訓練日得 1 張、最多 2 張（js/game/phase0.js forgivingStreak）。
- 最小課：熱身＋主動作，寫 session minimal（Movement 30、計活動日），不計完整健身房課；
  散步只寫 phase0 log，不寫 session、不計 Movement、不計 Perfect Day。
- 晨間伸展：15 分鐘／5 分鐘短版皆算完成，獨立每日例行，不計健身房達標率 x/4、不單獨當完整 Move。
- 提醒：1 個使用者自定時間，App 內提醒（PWA 無法保證系統推播），未完成才提醒。
- Upbeat 慶祝：Phase 0 面板完成動作顯示放大慶祝文案（T1），XP／等級／d16 皆不變。
- 探索洗牌機進 App：14 個任務（與對話 widget 相同），按一次轉 8 下再停在新任務、不連續重複，每任務有完成標準；
  完成只記為探索嘗試，Phase 0 不改 XP、Perfect Day、連續；P1 Perfect Day 仍為動＋眠 2 支柱，P2 解鎖後才 3 支柱。
- 健身房模板以 reel 為準：上肢 7 動作各 2 組、下肢 6 動作各 2–3 組，不發明 A/B 差異；
  疼痛旗標：當日該動作停用、進步暫停，記入 phase0.pain。

## 未完成／需確認
- 教練簽核：模板仍是草案，正式出貨前須教練驗證簽核（未簽核，不假裝已簽）。
- GitHub CI：未推分支，CI 未跑；v32 快取真機升級未驗；系統推播非 Phase 0 承諾範圍。
- 既有引擎未動：engine.js、rewards.js、timeline.js、game.json 皆未改；phase0 資料存 state.phase0，migrate 原樣保留。
