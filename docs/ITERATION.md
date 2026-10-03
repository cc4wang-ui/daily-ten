# Daily Ten — 迭代迴圈（D22）

> 目標：App 跟著 Cross 的使用每週升級一次，Cross 的輸入降到最低。視覺版：Cross 的 Artifact「Daily Ten 迭代迴圈」。
> 本檔是流程的權威版本；與 SKILL.md 衝突時以 SKILL.md 的派工規則為準，本檔只定義節奏與 Cross 的輸入點。

## 每週一圈

```mermaid
flowchart TD
  U["① 使用：每天打卡<br/>（Cross，1 次點擊）"] -->|打卡紀錄，只存在手機| A["② App 自我調整<br/>目標／難度／階段依紀錄自動調（M2a 起）"]
  A -->|滿 7 天跳出備份提醒| B["③ 存備份<br/>（Cross，每週 1 次點擊）"]
  B -->|備份檔 .json| R["④ 週報分析<br/>找卡點，提 1–3 個改進"]
  R -->|週報＋3 個提案| C["⑤ 選一個<br/>（Cross，1 次點擊）"]
  C -->|選擇| D["⑥ 開發：subagents"]
  D -->|PR| Q["⑦ 驗收：qa-checker＋CI<br/>不過自動修 2 輪"]
  Q -->|PASS＋CI 綠燈| M["⑧ 上線：Orchestrator 直接 merge（D22）"]
  M -->|新版 Service Worker| S["⑨ 手機自動更新（D23）<br/>開啟或切回就換新版，訓練中不打斷"]
  S -->|每週一圈| U
```

## Cross 的輸入點（只有這些）

| 頻率 | 輸入 | 方式 |
|---|---|---|
| 每天 | 打卡 | 1–3 次點擊（本來就在用） |
| 每週 | 存備份 | 首頁提醒卡 1 次點擊 |
| 每週 | 選改進 | 一個單選（A／B／C／略過）；沒有回覆就不開工 |
| 方向改變 | checkpoint | 一個單選，第一個選項是建議 |
| 每個版本 | 真機確認 | ≤3 條，只列機器驗不了的，併進日常使用 |

不需要 Cross：開 session 寫長指示、看 code、跑指令、merge、手動重開 App。

## 規則

1. **merge**：qa-checker PASS＋CI 綠燈 → Orchestrator 直接 merge（D22）。FAIL 修 2 輪仍不過 → 停下給 Cross 單選（降範圍／延後／我提供資訊）。
2. **更新**：每次改 App 檔 → `sw.js` CACHE +1（CI `check-repo` 比對 main 自動檢查）；手機端由 D23 自動套用。
3. **資料**：App 本身不連網、無帳號（原則 1 不變）。週報分析只讀 Cross 自己存下的備份檔。
4. **App 內調整優先**：能用 `data/*.json` 的規則讓 App 自己適應的（目標、難度、階段），不改程式；需要改程式的才進 ⑥。

## 部署與週報（Cross 2026-10-03 選 A）

- **部署**：搬到 Vercel（每個 PR 有預覽網址、可設 header、獨立網址不和其他 Pages 專案共用儲存）。舊網址留一張搬家卡，引導下載備份 → 新網址匯入。
- **週報（步驟 ④）**：Cross 每週把備份存到自己的 Google Drive（分享選單 → Drive）；每週日晚上一個排程 session 只讀 Drive 上最新的備份，產出週報＋3 個提案，推播給 Cross。App 本身仍不連網、無帳號。
- 週報不寫回 repo（repo 是公開的），也不寫 Drive；排程上線前先給 Cross 確認 loop 契約（NAME／TRIGGER／GOAL／STOP／BUDGET／FAIL）。
- 上線前：④ 改為 Cross 說「繼續」時，由當次 session 依 `HANDOFF.md` 提案。
