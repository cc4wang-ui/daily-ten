# 彈力帶阻力標記 QA（2026-10-19）

**結論：PASS。** 本次新增 8 個 Playwright 情境，與既有訓練回報及次數進階測試合跑 **19/19 PASS**。相關純邏輯與資料測試 **41/41 PASS**。使用 Chrome、`Asia/Tokyo` 假時鐘、隔離 fixture，網路守門確認沒有外部請求或未捕捉頁面錯誤。

## 本次實測

| 範圍 | 證據 |
|---|---|
| 回報欄位 | 主要編號彈力帶工作組顯示；徒手動作隱藏；肩推不借划船標記；前日與同日同變式預填；輸入修剪後儲存，空白省略欄位。 |
| 邊界與安全 | 40 個 Unicode 字可存，41 字停在暫停的表單並顯示錯誤；含 HTML 的標記以文字顯示，沒有產生 `img` 節點。 |
| 次數決策 | 同標記兩個完整輕鬆日由 10 加至 11；改標記、未記錄標記、同日混用標記不借用正向證據；當天改標記不重算已建立的工作序列。 |
| 持久性 | 重載後今日標記可預填，備份下載與再次匯入保留原標記；Service Worker 控制頁面後斷網，仍能儲存標記、重載及恢復固定的當堂目標。 |
| 儲存錯誤 | 模擬 localStorage 額滿時停在回報表單且顯示失敗；恢復後重試只留同組一筆回報，完成紀錄與 XP 不變。預期的單筆 `console.error` 亦逐字驗證。 |

## 獨立檢視

- `js/game/training-progression.js` 僅識別三個支援的彈力帶編號工作組；最新標記預設排除今天，UI 預填才明確納入今天。完整日期、唯一 ID、有效標記、同一標記下的完整組數與既有完成日均須成立才採用正向證據。混標記、缺標記與過長原始標記不會補成另一器材的成功日。
- `js/state/schema.js` 的 resistance 為選填、非空白、最多 40 個 Unicode 字；無效且已提供的標記會丟棄**整筆**回報。舊紀錄未新增欄位；匯入及備份保留有效原字串。這些規則另由 4 個資料測試驗證。
- 同組 ID 重新開啟的既存標記優先權已在 UI 實作中檢視；UI 負責人另有直接執行的檢查。本次新增的 8 個瀏覽器情境沒有單獨重播該編輯路徑。

## 執行結果

```text
Playwright: resistance-feedback.spec.js 8/8 PASS
Playwright: resistance-feedback + training-feedback + training-progression 19/19 PASS
Node: training-feedback.test.mjs + training-progression.test.mjs 41/41 PASS
```

本次沒有產品碼修改。新測試：`tests/e2e/resistance-feedback.spec.js`。
