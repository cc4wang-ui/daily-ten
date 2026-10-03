# 台灣繁中用語表檢查報告

> **Jev 未執行 —— 本報告為關鍵字規則（tools/jev/zh-tw-glossary.json）**
>
> 規則來源：CLAUDE.md §11｜既有違規 baseline：`tools/jev/glossary-baseline.json`（產生自 ec87e03，2 筆）
>
> 重產：`node tools/jev/check-glossary.js`｜CI：`node tools/jev/check-glossary.js --ci`（新增違規 → exit 1；既有違規只列出、不擋 M1）

## 摘要

| 項目 | 數量 |
|---|---:|
| 掃描檔數 | 24 |
| UI 字串數（含中文字的字串） | 638 |
| 新增違規（不在 baseline，CI 會擋） | 0 |
| 既有違規（baseline 內，M3 修正） | 2 |
| baseline 條目本次未出現 | 0 |

掃描檔案：`demos.js`、`index.html`、`js/app.js`、`js/state/backup.js`、`js/state/migrate.js`、`js/state/schema.js`、`js/state/store.js`、`js/state/time.js`、`js/ui/audio.js`、`js/ui/backup.js`、`js/ui/body.js`、`js/ui/boss.js`、`js/ui/content.js`、`js/ui/dates.js`、`js/ui/demo.js`、`js/ui/dom.js`、`js/ui/history.js`、`js/ui/home.js`、`js/ui/program.js`、`js/ui/session.js`、`js/ui/setup.js`、`js/ui/train.js`、`js/ui/update.js`、`js/ui/wakelock.js`（`data/*.json` 尚不存在，略過）

## 新增違規

（無）

## 既有違規（M3 修正清單）

M1 行為零變更，既有畫面的用語只列出、不修改（PLAN.md §3）。

| 位置 | 規則（詞） | 字串 | 建議用詞 |
|---|---|---|---|
| `index.html:187` | `duration`（時長） | `時長依你目前等級的劑量算出，會隨升級變長。 伸展組 A 髖與…` | 時數／時間 |
| `js/ui/boss.js:88` | `data`（數據） | `測驗完成。數據不說謊。` | 統計／紀錄 |

## 規則清單（CLAUDE.md §11）

| id | 不用 | 改用 | 情境 |
|---|---|---|---|
| `window` | 窗口（時間） | 時段 | 時間情境（例：起床窗口 → 起床時段）；服務／聯絡窗口等非時間用法不判 |
| `duration` | 時長 | 時數／時間 | 所有情境；「同時長按」「一小時長」「即時長條圖」是別的詞，不判 |
| `scatter` | 散點 | 分布圖 | 圖表名稱 |
| `data` | 數據（分頁、標題） | 統計／紀錄 | 分頁、標題；關鍵字規則無法分辨情境，內文出現也列出 |
| `disconnect` | 斷線（非網路情境） | 中斷 | 非網路情境（例：昨天斷線 → 昨天中斷）；同一字串提到網路／連線時不判 |
| `settings` | 設置 | 設定 | 所有情境 |
| `undo` | 撤銷／撤回 | 復原 | 所有情境（「復原」是保留詞） |
| `pushup` | 俯臥撐 | 伏地挺身 | 動作名稱 |
| `video` | 視頻 | 影片 | 所有情境 |
| `message` | 信息 | 訊息 | 所有情境（information 用「資訊」） |
| `n-streak` | N 連（例：7 連） | 連續 N 天 | 數字（半形、全形、中文數字）後接「連」的簡寫，含 `${n} 連`、n + ' 連'；「連 3 天」「連續」「連結」「一連串」「接二連三」「三連假」「3 連勝」不判 |
| `receive` | 收下 | 領取 | 領獎情境（例：收下徽章 → 領取徽章）；「收下巴」「收下腹」等動作提示不判 |
| `anchor` | 錨點（使用者畫面） | 小習慣 | 使用者畫面字串（程式內部可用 anchor；註解與識別字不檢查） |
| `streak-en` | streak（數值概念用英文） | 連續天數 | 數值概念用中文；只檢查含中文的字串（純英文標籤不在範圍）。品牌名詞 Perfect Day、Boss Day 保留英文 |

保留詞（永不判違規）：打卡、保底版、熄燈、復原。品牌名詞保留英文：Perfect Day、Boss Day。

## 掃描範圍與判定

- `index.html`：文字節點與可見屬性（placeholder、title、aria-label、alt 等）；inline `<script>` 依 JS 規則掃字串常值；略過 `<style>`、HTML 註解、`<script src>`。
- `demos.js`、`js/` 下的 `.js`：字串常值與 template literal 的靜態片段；略過註解；regex literal 不當字串。
- `data/*.json`：所有字串值（不含 key）。
- 只有含中文字的字串才算 UI 字串；比對前解碼跳脫字元與 HTML 實體，並把連續空白（含換行）壓成一個空格。
- 既有／新增以 `{rule, term, text}`（text = 完整字串）比對，不看檔名與行號：字串搬檔、換行號仍算既有；內容一改就算新增。
