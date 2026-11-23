# QA：上半身／腿日切換（gym-type）第 1 輪

- 日期：2026-11-23
- 對象：分支 `claude/daily-ten-toggle-bug-oox4of`，HEAD `d8d6877`（相對前一個 commit `b564fdb` 改 8 檔）
- 驗收員：qa-checker（獨立 context；沒有改產品碼、沒有 commit）
- Cross 原話：「Daily ten有問題。我要切換腿日或上半身的時候沒辦法切換。這是重大bug 要記起來」

## Verdict：PASS

8 條 STOP 全部 PASS。沒有找到「會壞資料／跑不完」的問題。找到 6 個「其他」問題，其中 O-1 最值得修：匯入備份後畫面不會馬上更新（main 上就有，不是這次造成的），而新的切換鈕在那個當下會算錯 A／B。STOP 5 我判 PASS 的依據是「儲存的資料正確、沒被改寫、不合法值不會讓畫面壞掉」；如果你把 STOP 5 讀成「匯入完那一刻的畫面也要對」，那一個子項是 FAIL，證據在 O-1。

## STOP 逐條

| # | 條件 | 結果 | 證據 |
|---|---|---|---|
| 1 | 1 次點擊切換；「下一次」卡與課表換成對應的課（上半身 7、腿日 6） | PASS | 實際用觸控操作（375×667）：按「腿日」一下 → 卡片「下一次：Lower A」「腿日 · 6 個動作」、課表 6 列、toast「下一次改練腿日」、`aria-pressed` 換邊；按回「上半身」→ 7 列。QA-2、QA-6、QA-12、作者的 gym-type.spec.js 第 1 條 |
| 2 | 切換後「開始訓練」開到選的那一課 | PASS | 手動操作：課表標題 Lower A、6 個動作。QA-7、QA-12（Lower B）、QA-11（今日頁「開始」也開到 Lower A）、QA-15（離線） |
| 3 | 重開後還在；今日頁同步 | PASS | 重新載入後今日頁「下一次：Lower A」、健身房頁相同；`localStorage` 的 `v4.gym.pick = "Lower A"`。QA-8（隔天還在）、QA-13（03:59 選、04:01 換日後還在）、QA-15 |
| 4 | 練完改選的課後自動排另一類；仍可再手動切換 | PASS | QA-12：已練 Lower A → 手動選腿日＝Lower B → 完成 → 自動 Upper A（上半身亮）→ 再按腿日＝Lower A。單元測試 `tests/core.test.mjs` 新增 1 條；另外用 node 跑 40 輪（含部分完成）比對舊規則「完成次數 % 4」與新規則：0 處不同 |
| 5 | 舊資料不壞 | PASS（見 O-1 的但書） | QA-1：沒有 pick 的舊 state 開啟、逛健身房頁、重開兩次，`v4.gym` 逐字不變、沒有多出 `pick`，第二次重開整份儲存不再變。QA-I1（7 種不合法 pick：`"Foo"`、`123`、`null`、物件、陣列、`"lower a"`、5000 字）：匯入成功、沒有錯誤卡、重開後當成沒選、可切換可開課。QA-I3：壞值在完成一課後被刪掉。QA-I2：合法 pick 照顯示。QA-4：復原完成的課 → 回到「進行中：Lower A」、紀錄 0 筆 → 再完成仍是 1 筆 Lower A、下一次 Upper A。全套遷移／匯入壞檔測試綠 |
| 6 | 離線、無新網路呼叫；觸控 ≥44px；用語表 | PASS | QA-15：SW 快取完成後斷網重開 → 切換、重開、開課、完成都可用，外部請求只有 `i.ytimg.com` 縮圖。`git show HEAD` 新增行掃描 `fetch(`／`http`／金鑰樣式：0 筆。按鈕 141×44（320px 寬）、169×44（375px 寬），不橫向捲動（QA-14）。`npm run check:glossary`：新增違規 0 |
| 7 | CACHE v41、check:repo、PROJECT_STATE 有記錄 | PASS | `sw.js`：`daily-ten-v40` → `daily-ten-v41`。`check-repo：通過（App 檔 45 個、預快取 46 項、CACHE daily-ten-v41，main 為 v40）`。`PROJECT_STATE.md` 第 3 行有 Cross 原話、根因（只照完成次數 % 4 排、畫面沒有換課方法）、修法、規則與 3 個踩坑 |
| 8 | 全套測試綠 | PASS | 見下方「指令輸出」 |

## 指令輸出

| 指令 | 結果 |
|---|---|
| `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test --trace off`（加我的測試之前） | `444 passed (1.2m)` |
| 同上（加我的 27 條之後） | `471 passed (1.7m)`（其中 2 條是 `test.fail` 標記的已知問題 O-1） |
| `npm run test:unit` | `tests 46 / pass 46 / fail 0` |
| `npm run lint` | exit 0，無輸出 |
| `npm run check:glossary` | `掃描 40 檔、UI 字串 1483 筆：新增違規 0、既有違規 0` |
| `npm run check:repo` | 通過，CACHE v41（main v40） |

PROJECT_STATE.md 寫的「單元 46、Playwright 444」與實測一致。

## 例行項目（本次範圍內）

| 項目 | 結果 | 證據 |
|---|---|---|
| 遷移 v1／v2／v3／被改回 v2 | PASS | `tests/state.migrate.spec.js` 等在全套裡，兩次全跑結果相同 |
| 匯入壞檔不白屏、不覆蓋 | PASS | `tests/e2e/data.spec.js`；加上 QA-I1 的不合法 pick |
| 離線 | PASS | QA-15、`tests/e2e/offline.spec.js` |
| 遊戲日邊界 | PASS | QA-13。pick 不綁日期；跨時區沒有另外為 pick 測（它不含時間），沿用既有測試 |
| `prefers-reduced-motion` | PASS | QA-14：切換鈕 `animation: none`、`transform: none`、`transition: none`；toast 在 reduce 下 `animation: none` |
| 前端碼掃描 | PASS | 新增行沒有金鑰、沒有新的連線 |
| 用語表 | PASS | 0 違規。順帶：全 repo 已沒有「上肢／下肢」 |

## DoD（CLAUDE.md §9）

| # | 項目 | 結果 |
|---|---|---|
| 1 | `npm test` 全綠 | 通過 |
| 2 | CACHE +1、新檔在預快取 | 通過（沒有新的 App 檔） |
| 3 | 動作同步 demos／VIDEOS | 不適用（沒有動到動作） |
| 4 | PROJECT_STATE 更新、README 網址 | 通過 |
| 5 | 用語表 | 通過 |
| 6 | qa-checker PASS | 本報告 |
| 7 | PR 描述附真機清單 | 沒辦法驗：這裡看不到 PR。清單見最下面，請放進 PR |

## 發現的問題

### A. 會壞資料／跑不完

沒有找到。

### B. 其他

**O-1 匯入備份後畫面不會馬上更新；這時按切換鈕 A／B 會算錯**（根因在 main 上就有；建議 ui-engineer）

- 重現 1：全新 App → 設定 → 貼上一份備份（`v4.gym.sessions` 有一筆完成的 Upper A）→ 確認匯入兩次。今日頁顯示「下一次：Upper A · 本週 0/4」；應該是「下一次：Lower A · 本週 1/4」。重新開 App 後才對。
- 用 `HEAD~1` 的程式跑同樣步驟結果一樣（匯入後 Upper A 0/4，重開後 Lower A 1/4），所以不是這次的切換鈕造成的。
- 重現 2（這次新增的程式會踩到）：全新 App → 匯入一份「已完成 Lower A」的備份 → 不重開，到健身房頁按「腿日」→ 排出 Lower A；照紀錄應該是 Lower B。
- 位置：`js/ui/settings.js:42` 匯入成功後只呼叫 `summary()`，沒有重算；`js/ui/gym.js` 的 `pickType` 讀同一份舊摘要。
- 影響：儲存的資料是對的，只有畫面與 A／B 選擇在重開前不對。Cross 換手機匯入備份時會遇到。
- 測試：`tests/e2e/qa-gym-type-import.spec.js` 的 QA-I4、QA-I5 用 `test.fail` 標記；修好後它們會變成「意外通過」，把 `test.fail` 拿掉即可。

**O-2 選了腿日但只做一部分（部分完成）→ 選擇被清掉，下一次回到上半身**（建議 game-designer 決定規則）

- 重現：全新 App → 健身房 → 腿日 → 開始訓練 → 6 個動作只勾前 4 個的組 → 完成（顯示部分完成）→ 回健身房頁：「下一次：Upper A」，`pick` 已被刪。
- 不一致的地方：沒手動選的時候，部分完成不算，下一次重排同一課；手動選的時候，部分完成卻把選擇清掉。`addGymSession` 不分完成或部分都刪 `pick`。可以再按一次腿日選回來。QA-9。

**O-3 復原完成的課之後再「放棄這次」→ 選擇不見**（建議 ui-engineer；很小）

- 重現：選腿日 → 練完 → toast「復原」→ 健身房頁「放棄這次」→「下一次：Upper A」。復原只還原了進行中的課，沒有還原 `pick`。只復原不放棄的話一切正常（QA-4）。QA-4b。

**O-4 完成一課後 10 秒內去按切換鈕，「復原」會被切換的 toast 蓋掉**（建議 ui-engineer）

- 重現：練完一課 → 按「太好了」→ toast「健身房完成 … 復原」出現 → 馬上到健身房頁按另一顆切換鈕 → toast 變成「下一次改練上半身」，復原鈕不見，這一課不能復原了。
- App 的 toast 本來就是新的蓋舊的；但今天完成後切換鈕仍顯示，所以多了一條會蓋掉復原的路。QA-16。

**O-5 選中的切換鈕白字配橘底，對比 2.9:1，低於 WCAG AA 的 4.5:1**（建議 ui-engineer）

- 實測：文字 `rgb(255,255,255)`、底 `rgb(249,115,22)`、13px 粗體。CLAUDE.md §7 要求文字對比 ≥ AA。樣式沿用既有的 `.days button[aria-pressed=true]`（星期鈕本來就這樣），這次把它用在最上面最顯眼的位置。

**O-6 `reports/copy-glossary.md` 沒有重新產生**（很小）

- commit 裡寫 UI 字串 1478 筆，現在的程式跑出來是 1483 筆。違規數都是 0。我跑 `check:glossary` 時它被改寫，已用 `git checkout` 還原成 commit 的版本。

### 看過、不算問題

- 不合法的 `pick` 匯入後會原樣留在儲存裡，讀取時才過濾，直到下一次切換或完成一課才被蓋掉或刪掉。與 nutrition entries 的既有做法一致。
- 同一瞬間先按腿日再按上半身（畫面還沒重畫）：第二下被忽略，結果是腿日，畫面與儲存一致（QA-6）。真人按不出這個速度。
- 有進行中的課時不顯示切換鈕；草稿是 Upper A、`pick` 是 Lower A 的矛盾資料也照草稿走，完成後 `pick` 被清掉（QA-10）。
- 今天已完成一課時切換鈕還在，只換下面的課表預覽，隔天「下一次」是選的那一課（QA-8）。
- 切換時打開中的換動作清單會收起；腿日課表換過的動作留著，開課用換過的動作（QA-7）。
- 開課後放棄：選擇還在（QA-5）。

## 我加的測試（沒有 commit）

- `/home/user/daily-ten/tests/e2e/qa-gym-type.spec.js`：16 條（QA-1 到 QA-16，沒有 QA-3）
- `/home/user/daily-ten/tests/e2e/qa-gym-type-import.spec.js`：11 條（QA-I1 ×7、QA-I2 到 QA-I5；I4、I5 是 `test.fail`）

截圖只放在暫存資料夾（環境回收就沒了）：`/tmp/claude-0/-home-user/89de5ef7-1146-5e0c-9c9b-2bade50c76e2/scratchpad/qa-gym-1-upper.png`、`/tmp/claude-0/-home-user/89de5ef7-1146-5e0c-9c9b-2bade50c76e2/scratchpad/qa-gym-2-lower.png`、`/tmp/claude-0/-home-user/89de5ef7-1146-5e0c-9c9b-2bade50c76e2/scratchpad/qa-gym-3-session.png`。

## Cross iPhone 真機清單

- [ ] 主畫面 App 打開後自動更新到新版（設定頁看得到版本），健身房頁最上面有「上半身｜腿日」兩顆按鈕。
- [ ] 用拇指按「腿日」一下：卡片變成「下一次：Lower A」，下面課表變成 6 個動作；按「開始訓練」開到 Lower A。
- [ ] 選了腿日後把 App 滑掉再開：今日頁與健身房頁都還是 Lower A。
