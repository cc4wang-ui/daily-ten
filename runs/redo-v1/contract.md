# 目標契約｜redo-v1（Daily Ten 全面重做）

Cross 原話：
> 讀完交接文件 讓fable制定開發方向 我的主要目標是一週四次健身房 每天早上伸展15分鐘 一個禮拜嘗試一個新的事物 然後把這三個套入遊戲化框架 讓我能循著規則自我正向回饋 整個app UI 要照著主要流行的習慣養成及健身app copy paste 千萬注意顯示資訊量的大小 顏色 編排等等 示範影片不要自己亂編 要使用YouTube點擊率最多相關性最高的的示範shorts. /board-intake 作為主要skill去調度所有你能使用的skill和接入的mcp 我要明天早上起床就看到一個完整的交付物 我給你所有授權 Fable的判斷就是我的判斷 開工

目標：明早 Cross 打開正式網址，看到一個以「健身房 4 次／週、晨間伸展 15 分／天、每週 1 件新事物」為核心、
照主流習慣養成＋健身 App 版型重做、含遊戲化回饋與 YouTube Shorts 示範的 Daily Ten 新版，已上線。

成功指標（Cross 的白話）：
1. 三個主要目標就是 App 的三個習慣，規則讓我能自我正向回饋。
2. UI 像主流習慣養成／健身 App（資訊量、顏色、編排都對）。
3. 示範影片是 YouTube 上點擊率最高、相關性最高的 Shorts，不是自己編的。
4. 明天早上就是完整交付物（上線可用）。

STOP 條件（可檢查）：
S1 今日頁一眼看到三個習慣的今日狀態與本週進度（健身房 x/4、伸展 x/7、探索 x/1），一顆主行動按鈕。
S2 健身房：可開始本次課表（Upper/Lower 輪替）、逐組記錄重量×次數、上次數字預填、休息計時、完成後有總結與 XP。
S3 伸展：15 分鐘完整版（分項目、每項倒數、自動換下一項）＋5 分鐘短版，一鍵完成；每項有「看示範 Short」。
S4 探索：本週任務卡（具體新手任務）、洗牌、完成時給 1–5 興趣分；每週 1 次計入週目標。
S5 遊戲化：XP、等級、連續天數（含 Freeze 不懲罰）、Perfect Day、Perfect Week、≥20 個成就、慶祝動畫；數值全在 data/*.json。
S6 示範影片：每個健身房動作與伸展項目各有 1 支 YouTube Short，為搜尋結果中相關且觀看數最高者；data/videos.json 記錄觀看數、頻道、查核時間；/shorts/<id> 實際回 200。
S7 UI：亮色、底部分頁、卡片、一致色系（每習慣一色）、觸控 ≥44px、375px 寬不橫向捲動、文字對比 AA；UI 字串通過用語表檢查。
S8 原則不變：無帳號、離線可用（SW 預快取）、localStorage 單機、無 runtime AI、舊資料不白屏（v3 fixture 遷移測試）。
S9 品質門：check-repo、glossary、node 單元測試、Playwright e2e 全綠；CI 綠；獨立把關者 PASS。
S10 上線：merge 到 main，正式網址 https://daily-ten-app.vercel.app/ 的 sw.js CACHE 版號＝main，首頁 JS 與 repo 逐字相同。

等級：L（對外／董事會交付、>150k、影片研究與探索池可並行）
預算：主工作 ~900k、影片研究 ~200k、探索池 ~120k、把關 ~200k；上限 ~2.1M token
保留事項：無（Cross 已明示「我給你所有授權」；merge 與上線屬已授權）

⚠️ 假設（附預設值）：
A1 三支柱改為 健身房／伸展／探索；睡眠打卡退出主循環（舊眠紀錄保留在資料裡不顯示）。
A2 伸展完整版 15 分鐘＝8 項（含 Cross 之前要求的胸椎＋肩膀 2 項），短版 5 分鐘＝5 項。
A3 健身房課表沿用 reel 模板（Upper 7 動作／Lower 6 動作，A＝B），一週 4 次由 Cross 自選日子。
A4 旧資料：健身房組數（phase1.gymSets）、伸展紀錄（phase0.stretch）、探索嘗試（phase0.exploreTries）自動搬進新結構；其餘舊欄位保留不動。
A5 上線路徑＝merge main → GitHub Pages → Vercel 轉送（docs/DEPLOY.md）；Cloudflare Pages 上的 v36 不在 repo，不追。
A6 示範影片只用外部連結＋縮圖，不內嵌 iframe（離線時顯示文字口令）。
A7 舊版 1000+ Playwright 測試綁舊畫面，一律改寫為新版測試；舊 AI 影格 media/exercises（76MB）移除。
