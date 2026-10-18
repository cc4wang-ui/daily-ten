# 個別動作次數進階 QA

日期：2026-10-18。基底：已交付的 PR #19。結論：**PASS（本次功能與規則範圍）**；PR 完整 CI 由 Orchestrator 執行。

QA 僅新增 `tests/training-progression.test.mjs`、`tests/e2e/training-progression.spec.js` 與本報告，沒有修改產品碼。

## 規則測試：24 passed

執行：`node --test tests/training-progression.test.mjs`。

- 無回報、缺規則、壞容器維持基準，純函式不改輸入且重跑／倒序資料結果相同。
- 同變式兩個不同完成日，每日足量工作組皆主動回報 easy、達當時目標、無疼痛且動作穩定，10 → 11；下一次加量需兩日真的完成 11，最高基準 +2 且受該變式上限限制。
- hard、未達標、疼痛、姿勢不穩會重設基準；負向即使發生在未完成課表也重設。未完成的正向回報不能升量。
- okay、缺組、壞資料、目標不符、缺必要組號或重複 ID 不能製造成功日；已取得的 bonus 保留，但連續成功中斷。
- h-plus 合法重複完整組號（每筆不同 ID、全部 easy 達標）可構成一天證據，每日仍只算一次；兩日各 [1,2,1,2] 可 +1。[1,1]、[2,3]、[99,100] 或多出不支援組號不能代替必要 1/2。任一追加組 hard 重設基準，任一重複 ID 阻止成功日。
- 僅採之前 28 天 full/cycle；含 28 天邊界、不含前一天。當天、未來、過期回報與 minimal/rain/rest/boss 不算成功；當天負向也不回頭改今天既定目標。
- 標準／跪姿／派克／左右側／彈力帶各自隔離；未支援的無編號、加練與徒手划船不憑其他變式進階。同日重複課表與重複完成 session 不增加成功天數。

## Chrome 整合測試：13 passed (4.1s)

```sh
PATH=/Users/crosswang/.nvm/versions/node/v24.15.0/bin:$PATH \
PW_CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
PORT=4187 npx playwright test tests/e2e/training-progression.spec.js \
  tests/e2e/program.spec.js tests/e2e/training-feedback.spec.js --workers=2 --reporter=dot
```

新增 7 項 e2e，加上既有課表／時間 2 項與回報 4 項。

- 週一 L2：兩日伏地 easy 顯示「基準 10 → 本次 11 下／組」；同日 hard 肩推維持 10。畫面目標、實際 checkpoint reps、sub 文字與每下 3 秒一致。
- 預估時間等於 checkpoint 每一步 reps × tempo／secs 的總和，含準備、休息與器材轉換。
- 同日重複完整回報、再練與重新開啟維持 11，不會再加。
- D6 降量：原 L3 降 L2，即使歷史足以讓 L2 加量，仍採 10 下基準。
- 舊資料無 feedback 維持舊劑量；無 trainingProgression 規則時遊戲層照常顯示且維持基準。暖身、保底與雨天不套肌力進階。
- 訓練中回報 11 下，下一步與重載後仍保留整份原始 sequence snapshot，不會當場重算。
- 週三主划船 11；獨立「加練」10；h-plus 追加同一區塊依 root 裁定保持同堂 11，沒有第二次進階。
- 所有 e2e 自動檢查外部請求、未捕捉例外與 console error。`git diff --check` 通過。

## 限制

這是同變式次數的小幅調整，沒有阻力、負重或活動範圍資料，因此不推斷力量等價、替代變式或整體等級自動升級。未重跑 Jev，這份報告不是 Jev 裁決。Node `.mjs` 新測試由 Orchestrator 納入 package／CI 腳本，不能只靠 Playwright discovery。
