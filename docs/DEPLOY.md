# Daily Ten — 部署（D24）

| 網址 | 角色 | 怎麼更新 |
|---|---|---|
| `https://daily-ten-app.vercel.app/`（Vercel 專案 `daily-ten`） | **正式網址**（Cross 主畫面用這個） | 不用做事：Vercel 把每個請求轉送到 GitHub Pages，main merge 後約 1 分鐘兩邊同時是新版 |
| `https://cc4wang-ui.github.io/daily-ten/`（GitHub Pages） | 內容來源；這個網址的首頁會顯示搬家卡 | main merge 自動部署 |

## 為什麼用轉送
Vercel 帳號的 GitHub 連線綁在另一個 GitHub 帳號，看不到 cc4wang-ui 的 repo（2026-10-03 試過 GitHub App 授權、公開 repo 部署都失敗）。Cross 決定「直接新建一個」：Vercel 專案不連 GitHub，只部署一個設定檔 `tools/deploy/vercel-proxy.json`，把所有路徑轉送到 GitHub Pages。

- 好處：正式網址是獨立的 Vercel 網域（資料不和其他 github.io 專案共用儲存）；更新零手動；之後若 Vercel 能連上 repo，可改成直接部署（根目錄 `vercel.json`、`.vercelignore` 已備好），網址不變、不用再搬一次資料。
- 同一份程式在兩個網址行為不同，靠 `js/ui/relocate.js` 判斷網址：舊網址顯示搬家卡、新網址（資料全新時）顯示匯入卡。
- Vercel 不快取轉送內容（`enableExternalRewriteCaching: false`）；正式網址公開，只有預覽網址需要 Vercel 登入（`ssoProtection: preview`）。

## 只有改轉送設定時才要重新部署
Vercel MCP `create_deployment`：`teamId` = `team_6HL0acbpoaKW1HCfcLy7fA0h`，`requestBody` = `{name:"daily-ten", project:"daily-ten", target:"production", files:[{file:"vercel.json", encoding:"utf-8", data:<tools/deploy/vercel-proxy.json 的內容>}]}`。部署後用 `web_fetch_vercel_url` 確認 `https://daily-ten-app.vercel.app/sw.js` 的 `CACHE` 與 main 相同。

## 注意
- GitHub Pages 停用或改路徑，正式網址會跟著壞：不要關 GitHub Pages、不要改 repo 名稱。
- App 在手機上從離線快取執行；GitHub Pages 短暫異常時不影響使用，只會延後更新。
