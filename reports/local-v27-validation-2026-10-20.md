# 本機補充驗證 · 2026-10-20

完整 GitHub CI（run39280094608，最終 commit4d0725b）1002 通過／8 略過。另在本機 Chrome 補跑，含 ec87e03 課表比對及 origin/main 升級基準，1001 通過／8 略過／1 失敗。唯一失敗是 relocate 設定測試的網路守門捕捉到 Chrome 自動請求 `/favicon.ico` 得到404，該測試本體的模組與網址斷言沒有失敗。

單獨重跑同測試亦出現相同 favicon404。Trace console location 明確為 `http://127.0.0.1:4291/favicon.ico`。本輪相對 main 的 harness.html、relocate.spec.js、relocate.js 及 serve.mjs 都沒有差異。此為測試頁圖示請求差異，沒有修改產品或放寬網路守門。正式站仍須另驗。

本機日誌 `/private/tmp/daily-ten-v27-full-test.log`；trace 已保存在 `/private/tmp/daily-ten-v27-relocate-favicon-trace.zip`。不得把本機補跑描述成全過。
