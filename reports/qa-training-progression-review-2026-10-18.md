# 每個動作次數進階：獨立審查

日期：2026-10-18。分支：`codex/per-movement-rep-targets`。審查 progression engine、data/game.json、program/trainhub/index/css 整合。審查者僅寫本報告，未修改產品碼或測試。

結論：**PASS（本次次數進階範圍；最初兩項發現已修正並複核）**。完整 PR CI 仍須通過。

## 發現與修正複核

1. 最初合法加一輪的回報組號 `[1,2,1,2]` 因重複組號被整日排除，無法進階。現在容許重複區塊，但每筆 occurrence 皆須有效、ID 唯一、相同 target、easy 達標且無負向回報；同一日期仍只算一次。獨立重現：兩個完整輕鬆 plus 日由 10 增至 11，一個 plus 日不能代替兩個日期。
2. 最初 `requiredSets=2` 時 `[2,3]` 也被視為完整工作組。現在必須完整包含 `1..requiredSets`，所有 ordinal 都在範圍內。獨立重現 `[2,3]`、只重複第一組 `[1,1]` 均維持 10，不能製造進階。

此外獨立斷言：重複 ID、追加組吃力、追加組 target 不一致均不能增加。對應的多日 plus、缺必要組與未知組號測試已由 QA 加入，最終單元測試通過。

## 產品邏輯審查

- 精確動作變式分開：標準／跪姿／派克伏地、分腿蹲左右不借用證據；未編號暖身、保底、雨天、cycleExtra 特殊加練不調整。
- 純函式按日期重播，無回報維持基準；當日、未來、無效日期、過期正向證據不加量；full/cycle 完成日期去重；負向／未完成負向回報回到基準；okay／資料不足不再增加。
- 規則由 data/game.json 提供：28 天、兩個成功日期、每次 +1、基準最多 +2 並受變式上限限制；只調次數，未聲稱能驗證阻力、活動範圍或力量變強。
- D6 降量／非目前強度保留本日基準，不疊加獎勵次數。沒有歷史回報或缺少規則，皆維持基準。
- 課表產生後是獨立序列；回報不重算 active checkpoint。重載保留既定步驟／次數。預估時間與 runner 均使用實際 `reps × tempo`。
- 當堂 h-plus 追加主區塊採相同既定目標，不二次增加；cycleExtra 的特殊加練步驟維持基準。訓練頁列出每個主動作「基準→本次」及調整原因。

## 獨立執行證據

- 最終 `node --test tests/training-progression.test.mjs`：**24 passed**。
- 修正後另外執行 6 組獨立 Node edge assertions：合法 plus、缺第一組、僅重複第一組、重複 ID、追加組負向、追加組 target 不一致，全部通過。
- 修正後 Chrome 行動視窗 375×667、獨立 port 4192，`tests/e2e/training-progression.spec.js`：**7 passed (2.9s)**。核對分動作加量、缺規則／舊資料基準、D6、重載與 checkpoint、暖身不加量、cycleExtra 不調整、當堂加一輪目標相同。
- `git diff --check`：通過。

## 範圍與限制

這是自我回報驅動的次數目標，沒有阻力、活動範圍、實際人體追蹤或力量測量。不同既定基準不借用 target 證據；28 天證據移出視窗後可能回到基準、需要重新累積。本報告不是運動安全、處方或醫療認證，也未重跑 Jev。完整 CI、正式部署與真實 iPhone PWA 不在此輪本機 Chrome 證據範圍，須由交付流程另行確認。

## 追加：正式站慢速首次下載修正

本次 PR 同時納入已在正式 v22 重現的素材載入問題修正。正式站 HTTP 200／1,687,636 bytes、下載約 43.8 秒，舊 15 秒 hard timeout 會提前移除 Image src 而 abort。這是主代理提供的現場重現證據；本審查沒有將它寫成 v23 已上線通過。

追加結論：**PASS（程式與本機回歸範圍）**。

- 15 秒改為提示首次下載較久，保留同一個 pending request、aria-busy 與隱藏／停用的影格控制；直到 Image 載入且 decode 成功才揭示。120 秒仍未完成才進失敗／重試狀態。
- `clearLoad()` 在成功、錯誤、timeout、重試前與 stop 都會清除 slow hint 及 hard timeout。hint callback 也驗證 active attempt；success／fail／stop 增加 attempt，過時 decode、error 或 hint 不會修改新示範或重啟舊播放。
- 原來的同 URL 重試、關閉返回與訓練計時暫停機制保留。關閉慢速示範再開另一動作，不受舊請求／120 秒 timeout 影響。
- 獨立 Chrome 行動視窗、port 4192 重跑 `tests/e2e/training-demo.spec.js`：**15 passed (5.9s)**。包含 20 秒才完成仍載入成功、119 秒仍維持下載提示／120 秒才可重試、成功後再過 120 秒不跳錯誤、慢速提示後切換動作無過時污染。
- 首輪測試曾因 route 關閉瀏覽器 cache，CSS background render 另發一次圖片請求而失敗；QA 修正為僅下載完成前要求單請求，成功後允許一次 CSS render，並持續驗證沒有 retry／過時 timeout。產品碼沒有因這個測試假設改動。

正式 v23 網路實測仍由主代理在合併部署後另做；此處 PASS 不等於已驗證正式部署成功。
