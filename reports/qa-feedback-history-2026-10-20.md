# QA：每組回報歷史（2026-10-20）

**Verdict: PASS**。新增 `tests/e2e/feedback-history.spec.js`，Chrome、375 × 667 viewport、Asia/Tokyo 固定時間，5/5 通過。測試使用 port 4301、2 workers。

| 檢查 | 結果 |
|---|---|
| 課表「查看回報」進入統計／訓練紀錄、帶入精確動作變式、返回再進入 | PASS |
| 舊資料沒有 `trainingFeedback`：空狀態與課表入口 | PASS |
| 零次、未完成主課表、`cycle` 完成日、阻力標記；負數資料被排除 | PASS |
| 惡意 HTML 作為文字顯示；無圖片節點或腳本執行；切換與檢視後 localStorage 原文不變（含 XP） | PASS |
| 近 28 天邊界（2026-09-22 包含、2026-09-21 排除）、全部、10 筆起始、每次加 20 筆 | PASS |
| 訓練中開歷史被導覽守門拒絕，畫面和訓練 checkpoint 不變 | PASS |
| 375px 截圖視察：控制項與回報列可讀、無水平溢出 | PASS |

回歸重跑 `tests/e2e/relocate.spec.js`：23 PASS、2 SKIP（未提供 `UPGRADE_BASE_DIR` 的舊版升級測試）。`tests/fixtures/harness.html` 已有 data favicon；先前該測試的 favicon console error 未再出現。

獨立檢視 7 張原始動作圖：`needle-left/right`、`side-plank-left/right`、`child-side-stretch`、`prone-half-floor-angel`、`pike-push-up` 均 **ACCEPT**。左右側動作使用相反支撐／穿針手臂；穿針只有穿過與返回、沒有朝天打開；半天使為臀側→W→臀側；各圖沒有空格或切換鏡位，循環首尾姿勢相接。

畫面截圖：`test-results/e2e-feedback-history-課表入口精確篩選變式，返回訓練後可再進入-chromium/feedback-history-375.png`（測試輸出，未納入 Git）。
