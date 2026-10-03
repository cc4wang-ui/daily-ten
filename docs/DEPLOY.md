# Daily Ten — 部署（D24）

| 網址 | 用途 | 怎麼更新 |
|---|---|---|
| `https://daily-ten-app.vercel.app/`（Vercel 專案 `daily-ten`） | **正式網址** | merge 到 main 後由 Claude 用 Vercel 工具部署（下方流程） |
| `https://cc4wang-ui.github.io/daily-ten/`（GitHub Pages） | 舊網址，只用來引導搬家（首頁搬家卡） | merge 到 main 自動部署 |

## 為什麼不是自動部署
Vercel 帳號的 GitHub 連線綁在另一個 GitHub 帳號，看不到 cc4wang-ui 的 repo（2026-10-03 試過 GitHub App 授權、公開 repo 部署都失敗）。Cross 決定「直接新建一個」：Vercel 專案不連 GitHub，改由 Claude 部署。

## 每次 merge 到 main 之後（Orchestrator 必做，D22 的一部分）
1. `git checkout main && git pull`，在 repo 根目錄執行 `node tools/deploy/manifest.mjs`，得到 `{commit, files:[{file, sha, size}]}`。
2. Vercel MCP `create_deployment`：`teamId` = `team_6HL0acbpoaKW1HCfcLy7fA0h`，`requestBody` = `{name:"daily-ten", project:"daily-ten", target:"production", files:<上一步的 files>, meta:{commit:<commit>}}`。
3. 若回覆缺少檔案（missing files，列出 sha）：對每個缺的檔案執行 `node tools/deploy/manifest.mjs --base64 <file>`，用 `upload_file`（`xVercelDigest` = sha、`contentLength` = size、`requestBody` = base64）上傳，再重做第 2 步。
4. `get_deployment` 等到 `READY`；再用 `web_fetch_vercel_url` 確認 `https://daily-ten-app.vercel.app/sw.js` 的 `CACHE` 等於 main 的版號。
5. 失敗：重試最多 2 次；仍失敗就在 PR 或給 Cross 的訊息寫明「Vercel 未更新」，GitHub Pages 仍是最新版。

## 每週週報開始前
週報排程（`docs/ITERATION.md`）先比對正式網址的 `sw.js` 版號與 main；不同就照上面流程補部署。

## 設定
- 專案：無 framework、無安裝、無 build（`vercel.json`）。部署清單 = `sw.js` 的 `ASSETS`＋`sw.js`＋`vercel.json`，與離線預快取同一份。
- 保護：只有預覽網址需要 Vercel 登入；正式網址公開（`ssoProtection: preview`）。
