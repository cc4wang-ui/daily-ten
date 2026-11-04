# Daily Ten

Cross 的個人習慣遊戲（PWA，無帳號、離線可用、資料只在裝置上）。三個習慣：

| 習慣 | 目標 | 怎麼算 |
|---|---|---|
| 健身房 | 一週 4 次（日子自選） | 課表 Upper A → Lower A → Upper B → Lower B 輪替；逐組記錄重量×次數；上次數字預填；休息計時；完整課 +100 XP，部分 +50 |
| 晨間伸展 | 每天 15 分鐘 | 8 項引導倒數（含胸椎、肩膀活動度）；5 分鐘短版 5 項；完整 +40 XP、短版 +20 |
| 探索 | 一週 1 件新事物 | 任務池 67 件（東京實地＋在家），每週抽 1 件、可換；完成給 1–5 興趣分，+60 XP |

遊戲化：XP、等級（每級 200 + 50×(等級−1)）、連續天數（連續 7 天得 1 張 Freeze，漏一天自動補）、Perfect Day（健身房＋伸展同一天，+30）、Perfect Week（4／6／1，+200）、每週目標各 +50、PR +10、回歸 +20、32 個成就。漏掉的日子不扣 XP。所有數值在 `data/*.json`。

示範影片：每個健身房動作與伸展項目各 1 支 YouTube Short，是搜尋結果中相關且觀看數最高者（`data/videos.json` 記錄觀看數、頻道、查核時間；研究方法見 `runs/redo-v1/reports/videos.md`）。影片在 YouTube 開啟，不內嵌；離線時照文字口令做。

正式網址：`https://daily-ten-app.vercel.app/`（Vercel 轉送 GitHub Pages，main merge 即更新；見 `docs/DEPLOY.md`）。

## 結構
```
index.html  css/{tokens,app}.css  js/app.js
js/state/   store.js migrate.js schema.js backup.js（v3 容器，原樣保留）、v4.js（三習慣資料：state.v4）
js/game/    core.js（XP／等級／連續／Perfect／成就／PR，純函式）、gym.js、explore.js
js/ui/      home gym stretch explore progress settings celebrate videos model nav dom toast icons backup update relocate
data/       game.json gym.json stretch.json explore.json achievements.json coach.json videos.json
tests/      core.test.mjs（node --test）、state.*.spec.js、e2e/*.spec.js（Playwright）
```

## 開發
```
npm ci
npm run test:unit          # 引擎單元測試
npm run check:repo         # 預快取、外部網址、示範影片登錄
npm run check:glossary     # 台灣繁中用語表
npm test                   # Playwright（state 單元＋e2e）
npm run serve              # http://127.0.0.1:4173
```
改了 App 檔就把 `sw.js` 的 `CACHE` +1；新增檔案要加進 `ASSETS`。

醫療免責：訓練、伸展與健康文字都是一般性參考，不是醫療建議。健身房模板是草案，未經教練簽核。
