# Daily Ten — Project Instructions (v-next: 睡眠先行 · 分階段解鎖 · 動眠探)

> 本檔是 Claude Code 在此 repo 的最高指示。與 PLAN.md 衝突時以本檔 §2 原則為準，其餘以 PLAN.md 為準。
> 開發流程一律走 skill `daily-ten-dev`（`.claude/skills/daily-ten-dev/SKILL.md`）。
> 2026-10-02 方向重定（D15–D21）：第三支柱由「律」改為「探」、睡眠先行分階段解鎖、三層目標、M2 拆為 M2a/M2b。

## 0. 與 Cross 協作的方式
- Cross 是 COO，**不是工程師**。回覆用繁體中文（台灣用語），技術名詞保留英文。
- 結論先行；表格優於長段落；一次最多問一個單選問題。
- 不交付「你試試看再告訴我」。交付前自己跑完驗證（§9），只留下**只有真機才能驗的項目**給 Cross。
- Cross 說「繼續」就夠：讀 `HANDOFF.md`、`docs/ITERATION.md`，直接進下一輪（D22）。
- 每個 Milestone 開始前、方向改變時，停下來給 checkpoint（做什麼／不做什麼／風險）。
- 遇到原則衝突：點名衝突，不要自己折衷。

## 1. 產品北極星
Daily Ten 是 Cross 的**個人成長遊戲**：穩定養成習慣、即時正向回饋、每週與季度里程碑，讓肌肉、睡眠、知識持續成長。

**身分宣言**（預設，可在設定改）：「我是獨立、自律、持續成長的人。」教練台詞、Perfect Day、週回顧都以「為這個身分投一票」為語氣。

### 1.1 三支柱
| 支柱 | 代號 | 色系 | 每日任務 | 解鎖 |
|---|---|---|---|---|
| 動 Move | `move` | 珊瑚橘 `#FF6B4A` | 完成當日課表（保底版也算） | 一開始就有（沿用既有 App） |
| 眠 Sleep | `sleep` | 靛紫 `#6C5CE7` | 早上 1 次打卡：起床＋確認昨晚熄燈時間 | P1（第 1 天） |
| 探 Explore | `explore` | 青綠 `#00B894` | 探索 ≥10 分鐘，打卡時給 1–5 興趣分 | P2 |

### 1.2 分階段解鎖（一次只加一個新習慣）
| 階段 | 預設期間 | 內容 | 進入下一階段 |
|---|---|---|---|
| P1 睡飽 | 第 1–2 週 | 動（現狀）＋眠 | 近 14 天中 ≥10 天起床在時段內 |
| P2 探索 | 第 3–6 週 | ＋探；第一個探索實驗＝DJ | 自動進入 P3 的條件見 §6 |
| P3 深化 | 第 7 週起 | 興趣分夠高的探索項目升級為「學習專案」 | — |

### 1.3 三層目標
| 層 | 節奏 | 內容 |
|---|---|---|
| 每日習慣 | 每天 | 三支柱打卡、即時 XP |
| 每週目標 | 週日結算 | 本週戰績＋從 3 個建議中選下週 1 個目標 |
| 季度目標 | 12 週 | 每支柱 1 個成長指標（預設見 §6） |

### 1.4 時間分配
起床時間是一天的錨點：就寢＝起床 −8 小時；睡前 30 分鐘放下手機；動與探排進剩下的時間。週回顧顯示時間預算（計畫 vs 實際）。

成功指標（App 內可見）：連續天數、7 日起床穩定度、每週 Perfect Day 數、AFT 三項差距、季度目標進度。

## 2. 不可違反的原則
1. **無帳號、無雲端、無訂閱**。所有使用者資料只在裝置 localStorage。
2. **離線可用**。任何新功能在飛航模式下必須完整運作。
3. **低摩擦**：每一項打卡都是 1 次點擊；新習慣**分階段解鎖**，不一次加滿；預設不讓使用者選；保底版永遠存在。
4. **不宣稱正式 AFT 通過**；17–21 歲標準只稱「自選目標」。
5. **舊資料不能壞**：結構變更必有遷移＋舊資料 fixture 測試。
6. 健康、睡眠、熱量文字都是一般性參考，**不是醫療建議**；不出現診斷語氣。
7. **Jev 只在 build time 使用**（D2）。前端程式碼不得呼叫任何 AI API、不得含任何 API key。
8. **遊戲化不懲罰**：漏掉的日子不扣 XP、不羞辱；中斷後隔天就提供回歸任務。
9. **動態但省電**：動畫只用 `transform`/`opacity`；尊重 `prefers-reduced-motion`；訓練進行中暫停所有裝飾性動畫（動作示範除外）。
10. **規則即資料**：所有數值（XP、等級曲線、時段、階段條件、目標、成就條件）放在 `data/*.json`，程式只做決定性計算。
11. **台灣繁中**：UI 字串遵守 §11 用語表；CI 檢查違規詞。

## 3. 已鎖定決策（Cross 可推翻，推翻須寫入 PLAN.md 決策紀錄）
| # | 題目 | 決策 |
|---|---|---|
| D1 | 方向 | 個人使用優先，無帳號 |
| D2 | Jev 用法 | Build-time 編譯產生／驗證 `data/*.json`；runtime 只查表 |
| D3 | AFT | 維持男性 17–21 歲三項自選目標＋差距自動計算 |
| D4 | 資料保護 | 下載 `.json` 備份＋7 天未備份提醒卡；匯入前驗證與預覽 |
| D5 | 就寢提醒 | `.ics` 每日提醒檔＋iOS 捷徑教學頁（不做 Web Push） |
| D6 | 自動降量 | 睡眠 <6h 或熄燈晚於時段 90 分以上 → 當日預設降一級，可一鍵恢復 |
| D7 | 架構 | 無 build；原生 ES modules |
| D8 | 測試 | `package.json`（dev only）＋Playwright＋GitHub Actions CI |
| D9 | 範圍拆分 | ~~三個 PR~~ → 由 D20 取代 |
| D10 | 專案指示檔 | `CLAUDE.md`、`.claude/**` commit 進 repo |
| D11 | 失效網址 | README、HANDOFF 全改為 `cc4wang-ui.github.io/daily-ten/` |
| D12 | 舊版 App 覆寫風險 | v3 保留並雙寫舊欄位 `xp`、`streak`；以 `game` 物件存在與否判斷已遷移 |
| D13 | `body.sleep` | 與 `habits.sleep.log` 並存不合併；`body.sleep` 不計 XP |
| D14 | `window.storage` | M1 保留，M3 評估移除 |
| D15 | 方向重定 | 第三支柱「律 Rhythm」→「探 Explore」；新增身分宣言、三層目標；原「睡前放下手機」併入眠作為睡前提示，每日回顧併入週回顧 |
| D16 | 分階段解鎖 | P1 睡飽 → P2 探索 → P3 學習專案（§1.2） |
| D17 | 眠打卡 | 早上 1 次點擊同時記錄起床＋確認昨晚熄燈（預填就寢目標，可改）；不要求睡前拿手機 |
| D18 | 時段計分 | 漸進：時段內滿分、超出 ≤30 分得一半、之後得基本分；不做全有全無 |
| D19 | 回歸任務 | 中斷隔天完成任一支柱即得回歸徽章；3 天內完成 2 支柱日另得 XP ×1.5 一天 |
| D20 | 範圍拆分 | 四個 Milestone、四個 PR：M1／M2a／M2b／M3（§8） |
| D21 | 文案 | 台灣繁中用語表（§11）；成就以「行為」命名，避免純刷量型佔多數 |
| D22 | 低輸入模式 | qa-checker PASS＋CI 綠燈 → Orchestrator 直接 merge；Cross 只做方向單選與 ≤3 條真機確認（流程見 `docs/ITERATION.md`） |
| D23 | 自動更新 | 新版上線後，App 在開啟或回到前景時自動檢查並套用；只在閒置時重新載入，訓練中不打斷；SETUP 顯示 App 版本 |

## 4. 目標架構
```
index.html            # 殼：markup + 載入 js/app.js（module）
css/tokens.css        # 設計 token
css/app.css
js/app.js             # 啟動、路由、畫面切換
js/state/             # store.js / migrate.js / schema.js / backup.js   ← data-guardian
js/game/              # engine.js（XP/等級/streak/成就/Perfect Day/階段/目標）, day.js  ← game-designer
js/habits/            # move.js / sleep.js / explore.js
js/ui/                # 各畫面元件、動畫、圖表（純 SVG）  ← ui-engineer
demos.js              # 既有動畫引擎（保留）
data/game.json        # XP、等級曲線、時段、階段條件、劑量規則
data/goals.json       # 每週目標建議池、季度目標預設
data/achievements.json
data/coach-candidates.json
data/coach-table.json # Jev 編譯產物
tools/jev/            # build-time 腳本（Node）；含 zh-tw-glossary.json
tools/sim/            # 90 天平衡模擬
tests/                # Playwright + fixtures（v1、v2、v3 state）
sw.js                 # 任何檔案變動 → CACHE 版號 +1，並更新預快取清單
```

## 5. State v3（localStorage key 不變：`daily-ten-state`）
M1 一次把 v3 欄位建好（空值），避免 M2 再升 v4。
- `habits.sleep.log[]`：`{date, lightsOut, wake, lightsOutEdited}`（ISO 含 offset）
- `habits.explore.items[]`：`{id, name, minimalAction, createdAt, status: "trying"|"project"|"dropped"}`
- `habits.explore.log[]`：`{date, itemId, interest(1–5)}`
- `goals`：`{identity, weekly:[{weekStart, goalId, target, result}], season:[{id, pillar, startDate, metric, target, status}]}`
- `phase`：`{current: "P1"|"P2"|"P3", startedAt, history:[]}`
- `game`：`{xp:{move,sleep,explore,total}, level, streaks:{train,life}, freezeTokens, achievements:{id:unlockedAt}, perfectDays[]}`
- `settings` 新增：`bedtime`, `wakeTime`, `windowMin`, `phoneDownMin`
- `meta.lastBackupAt`
- 遷移：既有 `xp` → `game.xp.move` 與 `total`（D12 雙寫）；既有 streak → `streaks.train`；`streaks.life` 由出席回推（只算 move）；`phase.current = "P1"`；`goals.identity` = 預設宣言。
- 冪等；失敗時原字串存 `daily-ten-state.bak-v2`，顯示可匯出錯誤卡，**不可白屏**。

## 6. 遊戲規格（初始值，全部在 `data/*.json`，由 sim 校準）
| 系統 | 規則 |
|---|---|
| 遊戲日 | 04:00 換日 |
| XP（每支柱上限 60） | 動：保底 30／主課表 50／加一輪 60。眠：起床在時段 30＋熄燈在時段 20＋睡滿 7h 10（D18 漸進）。探：完成 ≥10 分 40／≥25 分 60 |
| Perfect Day | **已解鎖**的支柱全完成 +30，觸發慶祝動畫 |
| 等級 | 下一級需 `200 + 50 × (level−1)` XP；三支柱各自等級 |
| Streak | `train`：有練就算；`life`：當日 ≥2 支柱完成；每連續 7 天得 1 張 Freeze，最多 2 張，自動使用 |
| 時段 | 預設就寢 23:00、起床 07:00，各 ±30 分；睡前 30 分放下手機（提示，不計分） |
| 穩定度 | 近 7 天起床時間標準差 → 0–100 |
| 階段 | P1→P2：近 14 天 ≥10 天起床在時段內；P2→P3：任一探索項目做過 ≥6 次且平均興趣分 ≥4（Cross 一鍵確認升級為學習專案） |
| 每週目標 | 週日結算；達成 +50 XP；下週目標從 `goals.json` 依狀態挑 3 個建議，1 次點擊選定 |
| 季度目標 | 12 週；預設：眠＝起床穩定度 ≥80 連續 4 週；動＝AFT 三項任一達自選目標；探＝試過 ≥4 項並選定 1 項學習專案；達成 +200 XP＋徽章 |
| 探索 | 每個項目有「兩分鐘版本」（例 DJ：練 1 個 transition）；第一個預設項目＝DJ |
| 成就 | ≥30 個，條件以資料描述（累積、連續、Perfect、Boss、PR、回歸、階段、目標、探索） |
| 回歸任務 | D19 |
| Boss Day | 沿用週日測驗＋週回顧卡 |
| 教練一句話 | `coach-table.json` 依狀態桶查表，同日固定（日期 hash） |

## 7. UI 設計系統：明亮、動態、資訊密度高
- 預設亮色；暗色依系統。背景 `#FAFAF7`，卡片白底圓角 20px，柔和陰影。
- 主要按鈕用深墨 `#1B1D1A`＋白字；支柱色只用在環、圖表、色塊；支柱色文字用加深版（動 `#B8401F`、眠 `#5446D6`、探 `#00795B`）以符合 WCAG AA。
- **今日**：三環＋中央等級（未解鎖支柱顯示虛線環＋解鎖進度）；身分宣言；本週目標卡；一顆「下一步」主按鈕；教練一句；AFT 差距卡；條件卡（D6 降量、備份提醒）。
- **早安打卡**：1 次點擊完成眠；10 秒內可復原。
- **目標**：週回顧（戰績、時間預算、選下週目標）、季度目標、探索清單。
- **動態**：環形填充 600ms ease-out、XP 數字滾動、升級全螢幕卡、Perfect Day 彩帶（Canvas，≤1.5 秒）；`prefers-reduced-motion` 改淡入。
- **圖表**：熱力圖、14 天起床分布圖、睡眠時數長條、AFT 差距條。原生 SVG，不引入圖表庫。
- 字型：離線可用（系統字型或自帶字型），不依賴 Google Fonts。
- 觸控 ≥44px；文字對比 ≥ WCAG AA；訓練畫面字級沿用。
- 分頁：今日／訓練／目標／統計／成就；設定在今日右上角。

## 8. Milestones（每個一個 PR）
| M | 內容 | 完成條件 |
|---|---|---|
| M1 地基 | 指示檔進 repo；修正失效網址；ES module 拆分（行為零變更）；state v3（含 D15–D17 欄位）＋遷移；備份／匯入驗證／提醒；設計 token；Playwright＋CI；用語表檢查 | 舊 v1/v2 fixture 全通過；功能與 `main` 等價；CI 綠燈 |
| M2a 睡飽＋目標 | engine（XP/等級/streak/freeze/Perfect Day/階段）、早安打卡、D6、D18、D19、每週目標、季度目標、`.ics`；sim | sim 三人設曲線合理；engine 單元測試覆蓋全部規則 |
| M2b 探索 | 探支柱、探索清單、興趣分、學習專案升級、時間預算 | P2/P3 轉換的 e2e 測試通過 |
| M3 介面＋Jev | 今日新首頁、三環、圖表、慶祝動畫、亮色主題；`coach-table.json`、文案合規 | Lighthouse PWA 通過；文案合規 0 違規；Cross 真機清單 |

## 9. Definition of Done（每個 PR）
1. `npm test`（Playwright：首頁、訓練流程、遷移、離線重開、匯入壞檔不白屏）全綠。
2. `sw.js` CACHE 已 +1，新檔案在預快取清單內。
3. 新／改動作已同步 `demos.js` 的 `MAP`/`def` 與 SETUP `VIDEOS`。
4. `PROJECT_STATE.md` 更新決策與踩坑；README 網址正確。
5. UI 字串通過 §11 用語表檢查。
6. qa-checker 回傳 PASS（附證據）。
7. PR 描述附「Cross iPhone 真機清單」（只列機器驗不了的項目，逐條可勾）。

## 10. 已知坑
- 舊網址 `crosswang-collab.github.io` 已失效 → `cc4wang-ui.github.io/daily-ten/`。
- iOS Safari：TTS 需使用者手勢觸發；wake lock 要做 fallback；PWA 無背景執行。
- 匯入會覆蓋 → 必須先預覽差異並二次確認。
- 跨時區：時間存 ISO 含 offset，遊戲日以當地時間計。
- 舊版 SW 快取的 App 會把 `version` 改回 2（D12）。

## 11. 台灣繁中用語表（`tools/jev/zh-tw-glossary.json` 為機器可讀版）
| 不用 | 改用 |
|---|---|
| 窗口（時間） | 時段 |
| 時長 | 時數／時間 |
| 散點 | 分布圖 |
| 數據（分頁、標題） | 統計／紀錄 |
| 斷線（非網路情境） | 中斷 |
| 設置 | 設定 |
| 撤銷／撤回 | 復原 |
| 俯臥撐 | 伏地挺身 |
| 視頻 | 影片 |
| 信息 | 訊息 |
| N 連（例：7 連） | 連續 N 天 |
| 收下 | 領取 |
| 錨點（使用者畫面） | 小習慣（程式內部可用 anchor） |
保留：打卡、保底版、熄燈、復原。品牌名詞保留英文（Perfect Day、Boss Day）；數值概念用中文（streak → 連續天數）。
