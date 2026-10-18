# 2026-10-18 動作影格來源與提示

使用內建 ImageGen（非 CLI/API）；素材為 AI 生成，未標記成真人影片或專業驗證。四張最終 PNG 的本機副本在 `media/exercises/`。4×4、16 格依序播放，可慢速與逐格查看。未透過程式修改像素。

| 本地資產 | 最終生成檔識別碼 | 提示規格與修正 |
| --- | --- | --- |
| band-overhead-press-storyboard.png | exec-419dc330-73b9-4ba4-89f6-32e4a4959af5 | 灰衣深色短褲成人，雙腳踩住紅色長帶，肩旁推至雙手過頭再回肩旁。固定視角、頭高及身體比例，預留頭頂空間；最後修成四欄四列、無多餘留白。 |
| band-rdl-storyboard.png | exec-c08acea2-690c-4e4c-8864-0a3df117a35f | 側視全身，雙腳踩住長帶，膝微彎、手臂伸直，髖往後推至前傾，再回站姿；無門錨／牆面固定。 |
| march-in-place-storyboard.png | exec-fd169cc1-e713-46b7-a46a-edb1af0ecfec | 正面全身，左右交替抬膝踏步，腳不同時離地；修正末列三格的水平朝向以延續第二側抬膝。 |
| step-jack-storyboard.png | exec-f940f73e-2017-400f-b1bf-447f291aefe0 | 左右輪流側跨，雙手外展上舉再放下，全程不跳躍；修正第 6、13 格延續原側收腳，避免中途切側。 |

提示共通約束：photorealistic full-body exercise sprite sheet; exactly four columns and four rows; same adult, gray tee and charcoal shorts; locked camera/scale, gray studio, no text/numbers/watermark. 肩上推最初候選因過頭伸展不足退件；六欄三列候選因版面不符退件。快走與側步的原始候選因左右順序錯誤未入庫。

可接受範圍：可辨識起始、主要動作及返回位置；只對確切同變式名稱開放。限制：肩上推部分影格仍有比例抖動，快走收腳過渡較突兀；16 格並非平滑實拍影片。程式驗證載入、原始比例、精確名稱、逐格與離線操作，不能證明人體示範的個人適用性。
