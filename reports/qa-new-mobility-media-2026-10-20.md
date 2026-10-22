# QA：新動作影格（2026-10-20）

**Verdict: PASS（已接入的八張）**。新增 `tests/e2e/new-mobility-media.spec.js`，6/6 通過；更新後的 `upper-back-media.spec.js`、`lower-core-media.spec.js` 合計 11/11 通過；`tests/exercise-media.test.mjs` 6/6 通過。Chrome、375 × 667 viewport、port 4301、2 workers。

| 檢查 | 結果 |
|---|---|
| 八張：左右穿針、左右側平板、嬰兒式側伸展、俯臥半程雪天使、派克伏地挺身、躺姿脊椎扭轉；catalog 對應精確名稱 | PASS |
| 不支援的派克第 3 組、腳抬高派克、泛稱穿針／側平板等仍是缺片 | PASS |
| 四秒重複動作的影格時程與課表 tempo；側平板靜態保持、雙側伸展的計時提示 | PASS |
| 動作庫八張解碼、來源比例、16 格定位、暫停、慢速、重播 | PASS |
| B 伸展與側平板訓練中求助不推進、返回保留同一步與 checkpoint | PASS |
| 新圖載入失敗可原址重試；Service Worker 預快取並離線重開八張可用 | PASS |
| 375px 無水平溢出，圖片與文字可讀 | PASS |

375px 截圖：`test-results/e2e-new-mobility-media-八張動作庫影格可解碼、逐格、慢速、暫停與重播；375px-無溢出-chromium/new-media-375.png`（測試輸出，未納入 Git）。在視窗頂端，固定於底部的「關閉」按鈕會蓋到播放控制列的下緣與安全提示；捲動後控制可操作，測試點擊全部通過。建議 UI 整合時檢查此重疊。

獨立檢視原始圖：先前七張與新增 `supine-twist`、`worlds-greatest-stretch-left/right`、`pigeon-pose` 均 **ACCEPT**。左右穿針與側平板區分正確；穿針只做穿過與返回，半程雪天使為髖旁→W→髖旁；世界最強伸展左右圖為相反側弓步與轉體，右圖第 12 格已無多餘手臂；鴿式以中間四足跪姿切到另一側，鏡位也隨側別轉換。沒有空白格。

`worlds-greatest-stretch-left/right` 與 `pigeon-pose` 於本報告撰寫時仍待 UI catalog 接入，尚不在上述八張的瀏覽器 PASS 範圍。
