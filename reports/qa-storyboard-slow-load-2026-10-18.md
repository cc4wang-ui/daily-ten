# 慢速首次下載動作影格 QA

日期：2026-10-18。PR #20 追加修正。結論：**PASS（載入與播放器回歸範圍）**。

正式站已由主代理確認：圖片 HTTP 200 但下載時間可能超過原本 15 秒期限。本次將 15 秒改為慢速提示、保留下載；真正無回應 120 秒才提供重試。

QA 只修改 `tests/e2e/training-demo.spec.js` 與本報告，未修改產品碼。

新增／更新的三個關鍵測試均使用 Playwright 假時鐘，沒有真實等待 120 秒：

- 請求保留 20 秒：第 15 秒顯示慢速提示、`aria-busy=true`，不顯示錯誤／重試／未完成影格或控制項；第 20 秒仍是同一載入請求，完成並成功解碼後才顯示影格與控制項。再推進 120 秒不會被舊提示或 timeout 改成錯誤。
- 卡住的請求：第 15 秒只提示，第 119 秒仍保留下載，第 120 秒才顯示失敗與重試；重試成功可逐格控制，原圖片晚到不會重啟播放器。
- 慢速提示後關閉再開另一個動作：舊圖片晚到與原載入／提示計時器都不能覆寫新動作、影格位置、暫停狀態或 busy/status。

Playwright 的 `page.route` 會停用 HTTP cache，圖片解碼後 CSS background 可能再請求同一 URL。測試因此分別驗證「下載期間只有 1 個請求」與「整個流程只設定 1 次預載 Image.src」，另允許一次 CSS 顯示請求，避免把渲染誤認為自動重試。

```sh
PATH=/Users/crosswang/.nvm/versions/node/v24.15.0/bin:$PATH \
PW_CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
PORT=4187 npx playwright test tests/e2e/training-demo.spec.js \
  tests/e2e/anchor-free-media.spec.js --workers=2 --reporter=dot
```

結果：**23 passed (8.2s)**，含既有錯誤重試、解碼失敗、減少動態效果、訓練進度保存與四新動作離線解碼。每個測試都有外部請求、console error、未捕捉例外守門；`git diff --check` 通過。完整 PR CI 與正式站交付確認由主代理執行。
