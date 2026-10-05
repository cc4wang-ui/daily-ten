# Daily Ten — PLAN.md

> 建立：2026-10-02（Asia/Tokyo）｜對照基準：`main` @ `ec87e03`｜Cross 已確認方向重定（2026-10-02）。
> 優先序：`CLAUDE.md` §2 原則 > 本檔 > 其他文件。

## 1. 決策紀錄
完整清單見 `CLAUDE.md` §3（D1–D26）。本次變動摘要：

| 日期 | # | 變更 | 來源 |
|---|---|---|---|
| 2026-10-02 | D10–D14 | 指示檔進 repo、網址範圍、舊欄位雙寫、`body.sleep` 並存、`window.storage` 暫留 | 接手時檢查 repo |
| 2026-10-02 | D15 | 第三支柱「律」→「探」；身分宣言；三層目標 | Cross 方向重定 |
| 2026-10-02 | D16 | 分階段解鎖 P1 睡飽 → P2 探索 → P3 學習專案 | Cross「先從睡飽做起」＋《原子習慣》兩分鐘法則 |
| 2026-10-02 | D17 | 眠改為早上 1 次打卡（熄燈補記） | 原設計要求睡前按手機，與「放下手機」矛盾 |
| 2026-10-02 | D18 | 時段漸進計分 | 避免全有全無 |
| 2026-10-02 | D19 | 回歸任務改為隔天 | 《原子習慣》「絕不錯過兩次」 |
| 2026-10-02 | D20 | 三個 PR → 四個 PR（M2 拆 M2a/M2b），取代 D9 | 範圍變大 |
| 2026-10-02 | D21 | 台灣繁中用語表；成就以行為命名 | 文案檢查結果 |
| 2026-10-03 | D22 | 低輸入模式：QA PASS＋CI 綠燈即由 Orchestrator merge；每週迭代迴圈見 `docs/ITERATION.md` | Cross：「減少我的輸入」「你有我全部權限」 |
| 2026-10-03 | D23 | App 自動更新（開啟／回前景檢查新版，閒置才重新載入，訓練中不打斷）＋版本顯示 | Cross 回報「網址還是舊版」 |
| 2026-10-03 | D24 | 部署改到 Vercel（PR 預覽網址、獨立網址）；舊 GitHub Pages 網址只留搬家卡 | Cross 選 A |
| 2026-10-03 | D25 | 每週 Drive 週報：讀 Cross 自己存的備份，產出週報＋3 個提案，Cross 單選後開發 | Cross 選 A |
| 2026-10-04 | D26 | 改版順序：外觀、三環、早安打卡一起先上；Milestone 改為 V1–V5（取代 D20 的 M2a／M2b／M3） | Cross 看到上線版與 mockup 落差大；qa-checker 差異報告（mockup 55 項中有 5、部分 11、沒有 39）＋ui-engineer 排程評估；Cross 選 B |

## 2. 本版範圍：M1 地基
| # | 項目 | 負責 | 完成條件 |
|---|---|---|---|
| 1 | Commit 指示檔（D10） | Orchestrator | `CLAUDE.md`、`PLAN.md`、`.claude/**` 在 repo |
| 2 | 網址修正（D11） | Orchestrator | repo 內（.git 除外）`crosswang-collab` 出現 0 次 |
| 3 | `index.html` 拆 ES modules，**行為零變更** | ui-engineer | 拆前／拆後各畫面 Playwright 截圖一致 |
| 4 | `css/tokens.css`（抽 token，不改外觀） | ui-engineer | 截圖一致 |
| 5 | State v3 schema＋`migrate.js`（含 `habits.explore`、`goals`、`phase`；D12） | data-guardian | 全部 fixture 通過；跑兩次結果相同 |
| 6 | 遷移失敗保護＋錯誤卡 | data-guardian＋ui-engineer | 壞 state 不白屏 |
| 7 | 備份下載＋7 天提醒卡 | data-guardian＋ui-engineer | e2e 驗證檔案內容與提醒條件 |
| 8 | 匯入：驗證 → 差異預覽 → 二次確認 | data-guardian＋ui-engineer | 4 種壞檔都顯示錯誤卡、原資料不變 |
| 9 | `tools/jev/zh-tw-glossary.json`＋檢查腳本（關鍵字規則，不需 Jev） | jev-compiler | CI 執行；M1 新增字串 0 違規（既有字串列報告，不擋 M1） |
| 10 | `package.json`、Playwright、`.github/workflows/ci.yml` | Orchestrator | CI 綠燈 |
| 11 | `sw.js` CACHE v5→v6，預快取含所有新檔 | Orchestrator | 離線重開 e2e 通過 |
| 12 | `PROJECT_STATE.md`、`HANDOFF.md`、README 更新 | Orchestrator | 與新結構一致 |
| 13 | 獨立驗收 | qa-checker | `reports/qa-m1-{n}.md` = PASS |

### 後續 Milestone 摘要
- **M2a 睡飽＋目標**：engine、早安打卡、D6/D18/D19、階段 P1→P2、每週目標、季度目標、`.ics`、sim。
- **M2b 探索**：探支柱、探索清單（預設 DJ）、興趣分、P2→P3 學習專案、時間預算。
- **M3 介面＋Jev**：今日新首頁、三環、圖表、動畫、亮色主題、離線字型、`coach-table.json`、文案合規 0 違規。

## 3. 明確不做（M1）
| 不做 | 原因 |
|---|---|
| 任何外觀或流程變更 | M1 行為零變更 |
| 遊戲規則、XP 計算 | M2a；M1 只建欄位 |
| Jev 呼叫 | M3；用語表檢查是關鍵字規則 |
| 雲端同步、帳號、Web Push | 原則 1、2 |
| 依實際年齡計 AFT、補齊五項 | D3 |
| 修正既有畫面的陸式用語 | 屬外觀變更，M3 處理；M1 只出報告 |

## 4. 資料結構變更（v2 → v3）
| 欄位 | v2 | v3 | 遷移 |
|---|---|---|---|
| `version` | 2 | 3 | — |
| `xp` | number | 保留雙寫 | → `game.xp.move`、`game.xp.total` |
| `streak` | `{current,best,lastDate}` | 保留雙寫 | → `game.streaks.train` |
| `game` | — | 見 CLAUDE.md §5 | 存在即視為已遷移；`streaks.life` 由出席回推 |
| `habits.sleep.log` | — | `[]` | 不捏造歷史 |
| `habits.explore` | — | `{items:[DJ 預設項], log:[]}` | DJ 預設 `minimalAction`：「練 1 個 transition」 |
| `goals` | — | `{identity: 預設宣言, weekly:[], season:[]}` | 季度目標在 M2a 建立 |
| `phase` | — | `{current:"P1", startedAt:null, history:[]}` | `startedAt` 於 M2a 首次開啟時寫入 |
| `settings` | `{voice,beep,band}` | ＋`bedtime:"23:00"`, `wakeTime:"07:00"`, `windowMin:30`, `phoneDownMin:30` | 預設值 |
| `meta` | — | `{lastBackupAt:null}` | — |
| 其他 | 既有 | 不變 | 原樣保留 |

Fixture：v1 最小、v2 真實、v2 缺欄位、v2 型別錯、空陣列、v3、「v3 被舊版改回 version:2」。

## 5. 驗收清單（M1）
| # | 項目 | 驗證方式 |
|---|---|---|
| 1 | v1/v2/v3 fixture 載入後畫面正常、XP 與 streak 正確 | Playwright |
| 2 | 遷移冪等；「被改回 v2」不重複計 XP | 單元測試 |
| 3 | 拆 module 前後截圖一致 | Playwright |
| 4 | 完整訓練流程（保底／今日／加一輪）、Boss Day | Playwright |
| 5 | 匯入壞檔 4 種 → 錯誤卡、原資料不變 | Playwright |
| 6 | 備份內容＝當前 state；7 天提醒條件正確 | Playwright（注入時鐘） |
| 7 | 離線重開全部畫面可用 | Playwright offline |
| 8 | 前端無 API key、無外部請求（YouTube 外連除外） | 掃描腳本 |
| 9 | `crosswang-collab` 0 次；SW = v6 | CI |
| 10 | 用語表檢查跑在 CI | CI |
| 11 | qa-checker PASS | `reports/qa-m1-*.md` |

**Cross iPhone 真機清單（M1 預定）**
- [ ] `https://cc4wang-ui.github.io/daily-ten/` 可開啟
- [ ] 更新後舊紀錄（streak、XP、PR、BODY）都還在
- [ ] 飛航模式從主畫面開啟可用
- [ ] 「下載備份」能存到「檔案」App
- [ ] 用剛下載的備份匯入，預覽與結果正確
- [ ] 訓練中 TTS 與示範動畫正常

## 6. 未解問題（已給預設，不阻擋 M1）
| # | 問題 | 預設 | 何時需 Cross |
|---|---|---|---|
| U1 | GitHub Pages 是否已在 `cc4wang-ui` 啟用 | 列入真機清單 | 真機清單第 1 條 |
| U2 | 起床／就寢目標 | 07:00／23:00（一般性參考，可在設定改） | ✅ Cross 2026-10-02 確認採用預設 |
| U3 | DJ 以外的探索項目 | 先只有 DJ；探索清單留空位讓 Cross 自己加 | M2b 開始前 |
| U4 | Jev primitives 名稱與 API | M3 開工時以 live docs 驗證 | M3 checkpoint |
| U5 | 示範動畫姿勢 | 等真機回報另案 | 有空時 |
