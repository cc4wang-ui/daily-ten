# Daily Ten — 部署（D24）

| 網址 | 角色 | 怎麼更新 |
|---|---|---|
| `https://daily-ten-app.vercel.app/`（Vercel 專案 `daily-ten`） | **正式網址**（Cross 主畫面用這個） | 不用做事：Vercel 把每個請求轉送到 GitHub Pages，main merge 後約 1 分鐘兩邊同時是新版 |
| `https://cc4wang-ui.github.io/daily-ten/`（GitHub Pages） | 內容來源；這個網址的首頁會顯示搬家卡 | main merge 自動部署 |

## 為什麼用轉送
Vercel 帳號的 GitHub 連線綁在另一個 GitHub 帳號，看不到 cc4wang-ui 的 repo（2026-10-03 試過 GitHub App 授權、公開 repo 部署都失敗）。Cross 決定「直接新建一個」：Vercel 專案不連 GitHub，只部署一個設定檔 `tools/deploy/vercel-proxy.json`，把所有路徑轉送到 GitHub Pages。

- 好處：正式網址是獨立的 Vercel 網域（資料不和其他 github.io 專案共用儲存）；更新零手動；之後若 Vercel 能連上 repo，可改成直接部署（根目錄 `vercel.json`、`.vercelignore` 已備好），網址不變、不用再搬一次資料。
- 同一份程式在兩個網址行為不同，靠 `js/ui/relocate.js` 判斷網址：舊網址顯示搬家卡（D27 起只引導打開新網址、加入主畫面）；新網址不顯示任何搬家相關的卡。
- Vercel 不快取轉送內容（`enableExternalRewriteCaching: false`）；正式網址公開，只有預覽網址需要 Vercel 登入（`ssoProtection: preview`）。

## 只有改轉送設定時才要重新部署
Vercel MCP `create_deployment`：`teamId` = `team_6HL0acbpoaKW1HCfcLy7fA0h`，`requestBody` = `{name:"daily-ten", project:"daily-ten", target:"production", files:[{file:"vercel.json", encoding:"utf-8", data:<tools/deploy/vercel-proxy.json 的內容>}]}`。部署後用 `web_fetch_vercel_url` 確認 `https://daily-ten-app.vercel.app/sw.js` 的 `CACHE` 與 main 相同。

## 照片估熱量（D30）
| 位置 | 內容 | 怎麼更新 |
|---|---|---|
| `https://daily-ten-app.vercel.app/api/meal` | App 呼叫的網址（同網域）。Vercel 把它轉送到下面的 Worker（`tools/deploy/vercel-proxy.json` 第一條 rewrite） | 改轉送設定時照上一節重新部署 |
| Cloudflare Worker `daily-ten-meal`（`https://daily-ten-meal.daily-ten-wan.workers.dev/`，帳號 `c6bc4ca1979bc44e4b5c75ef41d53b0e`） | 原始碼 `tools/deploy/worker/meal.js`；綁定 Workers AI（`AI`），沒有任何金鑰 | `PUT /client/v4/accounts/<帳號>/workers/scripts/daily-ten-meal`，multipart：`metadata`＝`{"main_module":"meal.js","compatibility_date":"2026-10-01","bindings":[{"type":"ai","name":"AI"}],"observability":{"enabled":true}}`、`meal.js`＝原始碼（`application/javascript+module`） |

- 模型：先用 `@cf/mistralai/mistral-small-3.1-24b-instruct`（約 7–10 秒），失敗改用 `@cf/google/gemma-4-26b-a4b-it`（約 45 秒）。2026-11-20 實測同一張雞肉沙拉碗：405–458 kcal。一張約 50 neurons，免費額度每天 10,000，約 200 張；用完回 429，不產生費用。
- 防護：只收 `Origin: https://daily-ten-app.vercel.app` 的 POST、JPEG data URL ≤1.4M 字元。Origin 可以被假造，所以最壞情況是有人把當天免費額度用完（App 會退回手動輸入）；不會花錢、也拿不到任何資料。
- 驗證：`curl -X POST https://daily-ten-app.vercel.app/api/meal -H 'origin: https://daily-ten-app.vercel.app' -H 'content-type: application/json' --data-binary @req.json`（`req.json`＝`{"image":"data:image/jpeg;base64,…"}`）應回 200 與品項；不帶 origin 應回 403。
- `tools/deploy/api/meal.js` 是沒有上線的備援：改走 Vercel AI Gateway 的 Claude（估得更準）。2026-11-20 實測回 403「requires a valid credit card on file」，要 Cross 在 Vercel 綁卡才能用；綁卡前不要部署它。

## 注意
- GitHub Pages 停用或改路徑，正式網址會跟著壞：不要關 GitHub Pages、不要改 repo 名稱。
- App 在手機上從離線快取執行；GitHub Pages 短暫異常時不影響使用，只會延後更新。
