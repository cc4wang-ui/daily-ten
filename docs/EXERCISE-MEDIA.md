# 離線動作影片交付規格

目前 `js/ui/exercise-media.js` 的正式影片清單為空；**0 個動作通過影片驗收**。介面可以顯示「沒有經審核的離線影片」，但不得把線條動畫、搜尋結果或未審核影片稱為完整教學。

## 取得影片

優先拍攝或委製本課表的動作。攝影時按課表的確切變式、器材與阻力、左右側、強度等級錄製；取得可離線散布及改剪的書面權利。若採開放授權素材，逐檔保存作者、原始頁、授權版本、所作修改與 App 中的署名。Wikimedia Commons 有[運動影片分類](https://commons.wikimedia.org/wiki/Category:Videos_of_physical_exercises)，但數量與變式不保證覆蓋課表；[各檔授權及署名要求不同](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en)。例如 [Burpee.webm](https://commons.wikimedia.org/wiki/File:Burpee.webm) 是一段可評估的候選影片，**尚未審核，也不能直接當本課表示範**。YouTube 搜尋結果不能充當離線素材；[YouTube API 政策限制未獲許可時下載、快取及離線播放](https://developers.google.com/youtube/terms/developer-policies)。

## 每個動作的驗收紀錄

1. 固定 `movementId`，列出課表中完全相同的 `names`。一個影片只涵蓋已核對的變式；左右側、跪姿、慢速、彈力帶固定方式與其他不同動作逐一判斷，不能用名稱前綴自動套用。
2. 影片至少有清楚的起始、離心、底部或終點、向心及結束姿勢，能看出完整活動範圍、速度、呼吸或用力時機。需要時提供前面與側面視角，完整循環可重播、暫停及慢速查看。短片或 GIF 若缺少這些關鍵階段，不合格。
3. 隨片提供起始姿勢、器材擺法、動作範圍、常見代償、停止條件與可用替代。逐字核對現行課表說明及劑量，確認沒有誤示不可靠固定點。
4. 由具運動專業資格的人員逐片檢查。紀錄姓名、資格、審核日期、審核結果與權利來源；退件片不得設 `reviewed: true`。剪輯、重拍或課表動作變更後重新審核。
5. 將通過的 MP4 或 WebM 放入 `media/exercises/`，在 `EXERCISE_MEDIA` 中登錄確切名稱、本機路徑、`reviewed: true` 和上述 reviewer/rights 欄位。建置時檢查檔案存在、每個正式課表動作恰好對到一片、檔案可解碼；把通過的檔案加入 Service Worker 預快取並更新快取版本。
6. 在 iPhone 主畫面 App 飛航模式下逐片測試播放、載入失敗提示、暫停/續播、求助後返回原步驟與剩餘秒數。任何缺檔或錯誤都應顯示「無法載入」，不能回退成完整教學的假象。

目前可由程式驗證「只有登錄、確切匹配、經審核的本機路徑才會進播放器」；專業動作審核、授權核對與真機解碼仍須在素材到位後完成。`node --test tests/exercise-media.test.mjs` 檢查查表與缺片狀態。
