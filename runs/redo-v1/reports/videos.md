# 示範影片研究報告｜redo-v1

查核時間：2026-11-03T23:47:48+00:00（共 22 筆；每筆至少 2 個 query，弱類別補到 5–8 個）

方法：以桌面 Chrome UA 抓 `youtube.com/results` 的 `ytInitialData`，合併 `shortsLockupViewModel`（Shorts 專區，近似觀看數）與 `videoRenderer`（精確觀看數）；候選先以 `/shorts/<id>` 回 200 篩掉一般影片（共查 448 筆，303 轉向者排除）；再對 finalist 抓 `/shorts/<id>` 頁取精確觀看數與頻道；標題有歧義者看說明欄與縮圖人工判斷。

| id | 繁中 | 選中 ID | 標題 | 頻道 | 觀看數 | /shorts | 為什麼選它 | 落選的高觀看候選與原因 |
|---|---|---|---|---|---:|---|---|---|
| incline-db-press | 上斜臥推 | `8fXfwG4ftaQ` | The PERFECT Incline Dumbbell Chest Press | Andrew Kwong (DeltaBolic) | 12,611,992 | 200 | 標題與說明都是上斜啞鈴臥推的正確動作要點（椅背 30 度等），相關候選中觀看數最高。 | 3VefleakxiQ（4.7M）是 Sam Sulek 訓練片段非教學；f7XwzvAhR8Y（9.0M）只講單一口令，列為備選。 |
| bench-press | 平板臥推 | `_FkbD0FhgVE` | Perfect Bench Press Form (DO THIS!) | Andrew Kwong (DeltaBolic) | 59,730,890 | 200 | 6 點臥推動作要領，所有候選中觀看數最高且主題完全吻合。 | P3woBOTrioY（6.2M）是啞鈴臥推且為名人片段；5SSdbmIjNj4（6.4M）是變化式對比。 |
| lateral-raise | 側平舉 | `Kl3LEzQ5Zqs` | The Perfect Lateral Raise (DO THIS!) | Andrew Kwong (DeltaBolic) | 18,782,365 | 200 | 啞鈴側平舉動作要點教學，觀看數最高。 | HeovYNoZDRg（18.0M）為三種前傾角度比較，教學性仍高，列備選。 |
| lat-pulldown | 滑輪下拉 | `hnSqbBk15tw` | Stop Messing Up Your Lat Pulldowns | Jeff Nippard | 15,783,006 | 200 | Jeff Nippard 滑輪下拉三個常見錯誤與修正，精確觀看數 15.78M 高於 DeltaBolic 的 15.09M。 | 77bPLrsMwiQ、5s6KGLTMgoI 皆為錯誤集，觀看數較低。 |
| upper-back-row | 上背划船（手肘外展） | `mSMJ3rwYMu0` | A great rear delt exercise! | Brandon Flihan | 3,887,667 | 200 | 縮圖與字幕顯示手肘外展、擠壓後三角與上背的啞鈴划船，與課表口令「手肘往外張開，擠上背」一致。 | 0QN8jx2nEQc（4.48M）High Row 機只有「這台機器真酷」的展示、無動作要領；P5CXx_jgTDE（12.1M）是繩索後三角而非划船；LsT-bR_zxLo（9.4M）是飛鳥；eA6JBY6PV4A（5.4M）是三種划船對比。 |
| bicep-curl | 二頭彎舉 | `803JIAWBj_c` | Don't Do Biceps Curls Like This ❌ | Sean Nalewanyj Shorts | 13,451,638 | 200 | 二頭彎舉基本要領（肘屈曲優先於重量），相關候選中觀看數最高。 | 9YPwqoLFcM4（20M）與 rZ4Qjx_fc7g（12M）是多動作合集。 |
| tricep-extension | 三頭伸展 | `b_r_LW4HEcM` | ✅ The PERFECT Overhead DB Tricep Extension | Andrew Kwong (DeltaBolic) | 14,375,967 | 200 | 頭頂啞鈴三頭伸展完整要點，觀看數最高。 | CqB7lsauyDI（15M）是 9 個三頭動作合集。 |
| squat | 深蹲 | `PPmvh7gBTi0` | Do You Have A Perfect Squat? (Find Out) | Jeff Nippard | 15,178,458 | 200 | Jeff Nippard 槓鈴深蹲 5 點檢查表（槓位、步距、深度），相關英文候選中觀看數最高。 | T6id8FuUcao（41.6M）為印度頻道 ShuruFit 的徒手深蹲對錯示範，語言無法確認、且非槓鈴深蹲，未採用。 |
| leg-press | 腿推 | `EotSw18oR9w` | ✅ The PERFECT Leg Press | Andrew Kwong (DeltaBolic) | 9,863,260 | 200 | 腿推動作要點教學，相關候選中觀看數最高。 | zhGhxYUv4yQ（105M）是力竭失敗影片；BnacvXdaxq8（38.5M）是腳位變化對比；Rs2RuWPNGhs（14M）是世界紀錄片段。 |
| rdl | 羅馬尼亞硬舉（髖鉸鏈） | `5rIqP63yWFg` | RDL Tutorial: 3 Simple Steps | Davis Diley | 11,287,298 | 200 | RDL 三步驟教學，觀看數最高。 | Wou9zVQrAfs（6.4M）與 up0sPrYCTkI（5.3M）是 RDL vs 其他硬舉的對比。 |
| calf-raise | 提踵 | `baEXLy09Ncc` | Get NOTICEABLY BIGGER Calves With This Technique | Jeff Nippard | 10,265,337 | 200 | Jeff Nippard 提踵技巧（站姿優於坐姿、停留與全幅度），觀看數最高。 | 無更高觀看數的相關候選。 |
| adductor-machine | 內收肌器械 | `uFWuVSxsT0Y` | Hip Abductor/Adductor Machine Exerciss Mistake ❌👎#shorts #shortvideo #fitness #gym #viral | RB Fitness  | 1,460,227 | 200 | 內收／外展機對錯示範（縮圖含 Adductor 面板的 ✅❌），相關候選中觀看數最高。 | P41tYEY_wYs（37M）與 wc2bb3cFQtE（8.2M）是「第一次用內收機」搞笑梗；BXs0PIkdXGs（2.1M）是 abductor vs adductor 對比；tu4o4quPv2k（1.9M）是外展機。 |
| leg-curl | 腿後彎舉 | `xdbEG3xGLI8` | ✅ The PERFECT Seated Leg Curl Tips | Andrew Kwong (DeltaBolic) | 7,298,028 | 200 | 坐姿腿後彎舉要點，觀看數最高。 | Lh3iMIcbkBQ（2.7M）是研究解說非動作示範。 |
| leg-extension | 腿前伸展 | `ztNBgrGy6FQ` | A Better Way To Do Leg Extensions | Jeff Nippard | 10,046,647 | 200 | Jeff Nippard 腿伸展更好的做法（10.05M），高於 DeltaBolic 的 9.06M。 | S5S0Eus4mDo（14.2M）說明欄顯示是「腿伸展機的其他用法」合集（腿彎舉、臀推等），非腿伸展教學。 |
| cat-cow | 貓牛式 | `2of247Kt0tU` | CAT-COW POSE (Marjaryasana-Bitilasana)🐮 😺 | Muscle & Motion | 13,773,772 | 200 | Muscle & Motion 貓牛式 3D 解剖示範，相關候選中觀看數最高。 | s1D1fpvl-A0、1GDkjZm6coU、1JFehrcYqzM 等上億觀看都是貓／牛動物搞笑片。 |
| thread-the-needle | 穿針式 | `gyew25Vaqj8` | Thread the Needle | Strength & Sport | 280,702 | 200 | 四足跪姿穿針式示範（縮圖確認），相關候選中觀看數最高；此動作的 Shorts 普遍觀看數低（<300K）。 | nxFFZNS0-t8（1.38M）標題為菱形肌疼痛舒緩、縮圖只有指位置，無法確認是穿針式；其餘 ≥40K 的是縫紉穿線小技巧。 |
| hip-90-90 | 90/90 髖部轉換 | `FM7-7-a0FLg` | How to 90-90 Hip Mobility Exercise | RehabFix | 653,862 | 200 | 標題明確為 90-90 髖關節動作教學，縮圖為坐姿 90/90。 | vur9ps_EM6E（679K）縮圖是 90/90 轉換但標題只寫 Hip Rotation；fDC2KC1XqY8（2.99M）是初學者髖活動度多動作合集；LPMltKj1BbQ（1.7M）是活動度挑戰宣傳，內容無法確認。 |
| worlds-greatest-stretch | 世界最偉大伸展 | `RmwNO39FRcY` | THE WORLD’S GREATEST STRETCH. 🔥💪🏾💯 #MOBILITY #CALISTHENICS #BODYBUILDING | Stacey Ervin Jr. | 2,203,446 | 200 | 縮圖確認為弓步旋轉的 World's Greatest Stretch 示範，精確觀看數 2,203,446 略高於 Dr. Caleb Burgess 的 2,144,480。 | 無。 |
| pigeon | 鴿式 | `KUclDkITsS8` | PIGEON POSE (Pada Kapotasana)📣 | Muscle & Motion | 1,816,745 | 200 | Muscle & Motion 鴿式 3D 解剖示範，觀看數最高。 | 無。 |
| supine-twist | 仰臥扭轉 | `EBMrPbWJIKA` | Low Back Stretch - Lower Trunk Rotations | Gulf Coast Spine & Sport, LLC | 1,132,039 | 200 | 縮圖確認為仰臥、雙膝倒向一側、雙臂打開的下軀幹旋轉＝仰臥扭轉，相關候選中觀看數最高。 | oFR9sPW4C2w（42M）縮圖是抱膝彈力帶放鬆、非扭轉；7T4OfWLPkpM（19M）為坐姿；fhQ-J1HFe4U（18.9M）縮圖為仰臥屈膝、無法確認扭轉；LpRnOEdygFc（10.8M）越南語；nesHMVcJ3x4、p-Ed_maZxvg 是自我扳背。 |
| wall-thoracic-opener | 靠牆胸椎開展 | `7mlnguqvrsA` | One Move For Instant Middle Back Pain Relief #Shorts | SpineCare Decompression and Chiropractic Center | 1,567,266 | 200 | 縮圖為雙手高放門框、胸口往下沉的中背伸展，與「雙手放牆上高處，胸口往兩臂之間下沉」吻合，相關候選中觀看數最高。 | xwARWc7-TB8（2.19M）是站姿多動作胸椎活動度合集；i_0zLUcE-zk（1.41M）是靠牆滑行（wall slides）另一動作；IIykk6yN0ak（813K）縮圖只指背闊肌、無法確認動作。 |
| down-dog-child | 下犬＋兒童式 | `YAmAET3Uomk` | How to do: CHILD'S POSE (BALASANA) #yoga #yogapose #yogatutorials #yogatutorial #yogaforbeginners | Karina Fit | 1,104,137 | 200 | 找不到同時含下犬式＋兒童式流程的 Short；選兒童式教學（1.1M）為最高觀看的相關候選，備選為下犬式教學，請注意只涵蓋一半。 | 2of247Kt0tU（13.8M）是貓牛式；dRAibO71JCM（333K）是兒童式→眼鏡蛇。 |

## 備選（alternates，依觀看數）

- **incline-db-press**：`f7XwzvAhR8Y` 9,042,864（explode your chest gains with this cue!）；`Gruq177Psnk` 8,083,889（Incline Chest Press Mistake (STOP DOING ）
- **bench-press**：`PTzUJkPrrDw` 21,606,837（Bench Press Form Guide）；`hWbUlkb5Ms4` 13,622,157（How To Bench Press With Perfect Techniqu）
- **lateral-raise**：`HeovYNoZDRg` 17,951,374（A Better Way To Do Lateral Raises）；`S0_u3LvWeaU` 13,560,397（How to Lateral Raise w/ Perfect Form!）
- **lat-pulldown**：`bNmvKpJSWKM` 15,087,378（✅ The PERFECT Lat Pulldown (DO THIS!)）；`nkak8_LLQiU` 9,729,172（Charles Glass Teach how to target Your L）
- **upper-back-row**：`0QN8jx2nEQc` 4,476,499（HIGH ROW MACHINE | BACK DAY）；`2ByilQ4NaAs` 1,709,033（The PERFECT Chest-Supported Dumbbell Row）
- **bicep-curl**：`0fioI6ed8Eg` 12,658,682（"Perfect Your Bicep Curls for Maximum Ga）；`MKWBV29S6c0` 10,093,696（PERFECT Bicep Curl Form Tips）
- **tricep-extension**：`9Ark9S11uXw` 8,974,912（The PERFECT Low Pulley Overhead Extensio）；`Rc7-euA8FDI` 7,453,434（STOP DOING These Tricep Pushdown Mistake）
- **squat**：`CspRAoM6ZKA` 12,757,370（3 Tweaks To Improve Your Squat Form At T）；`MLoZuAkIyZI` 10,538,549（Best Squat Tutorial Ever Made）
- **leg-press**：`nDh_BlnLCGc` 7,758,525（How To Leg Press With Perfect Technique）；`wa9UCsNWVo0` 6,969,911（You're doing leg press WRONG）
- **rdl**：`oQwnGfZFfzw` 7,011,216（Romanian Deadlift mistakes! Right✅ vs Wr）；`CBOhr6H7BEY` 6,112,889（RDL Tips）
- **calf-raise**：`wdOkFomQNp8` 3,610,251（Build BIGGER Calves (DO THIS!)）；`fOfPwmb5FXU` 3,247,218（STOP doing your CALF RAISES like this!）
- **adductor-machine**：`ktLkqP1upq0` 1,064,552（How to do Hip Adductors Correctly）；`BmMmt-c9aNM` 508,953（Seated Hip Adductors Machine）
- **leg-curl**：`_lgE0gPvbik` 3,473,299（Leg Curl Form Tips (DO THIS!)）；`FMCq0hT3KRU` 2,466,838（1 Leg Curl Mistake To Avoid ❌）
- **leg-extension**：`iQ92TuvBqRo` 9,064,981（✅ The Perfect Leg Extension）；`VtUtFD5PuDE` 5,069,507（Leg extensions hurting knees? DO THIS）
- **cat-cow**：`oMDrs7dPtxI` 3,724,811（How to do Cat-Cow Pose #catcowpose #marj）；`FyCuSE3mDcc` 1,381,153（Cat Cow Pose: Enhance Your Spine Mobilit）
- **thread-the-needle**：`h6_v-dZGLjY` 250,660（Thread The Needle Stretch）；`ds3umIYJDrE` 138,680（Thread The Needle）
- **hip-90-90**：`vur9ps_EM6E` 679,204（Hip Rotation = Deeper Squats）；`6dfkYZm9tpE` 408,830（90/90 Hip Rotation Done Right | Hip Mobi）
- **worlds-greatest-stretch**：`kSPS_HIQv8E` 2,144,480（The World's Greatest Stretch - Full Body）；`7XheaZERvBQ` 1,232,088（World’s greatest stretch | do this every）
- **pigeon**：`fpXMwDokkDM` 1,400,115（Easy Pigeon Pose For Beginners!）；`zE9Gis9vYcg` 517,533（5 need to know Pigeon pose tips）
- **supine-twist**：`LJMpSjJlP9g` 546,963（Supine Spinal Twist | Gentle Mobility Pr）；`ElKoMMaTPCM` 260,000（Supine Spinal Twist）
- **wall-thoracic-opener**：`NuDipJO6uck` 295,957（1/2 Kneeling Wall T-Spine Rotations (2-w）；`5HLQAVOvxNE` 236,425（Doorway Lat Stretch）
- **down-dog-child**：`T9ZA30LL-kY` 415,819（Tip for an easier downward dog 📌 #yoga）；`WhbfS-GR32U` 380,561（Quick tips of downward facing dog pose |）

## 保留意見

- 觀看數是查核當下 `/shorts/<id>` 頁面顯示的精確數字，會持續變動；搜尋頁 Shorts 專區只有近似值（如 12 million），排序以精確值為準。
- 相關性靠標題、說明欄、縮圖判斷，**沒有逐支看完影片**；thread-the-needle、hip-90-90、wall-thoracic-opener、supine-twist 的高觀看候選因無法確認動作而落選，可能錯過更高觀看但其實相關的片子。
- `down-dog-child` 找不到同時含下犬式與兒童式的 Short，目前只放兒童式教學（備選為下犬式），建議 UI 顯示時加註或拆成兩支。
- `upper-back-row` 選的是手肘外展的俯身啞鈴划船（後三角划船），觀看數 3.89M 低於 High Row 機展示片（4.48M）；後者只有「這台機器真酷」沒有動作要領，故未採用，可由 Cross 推翻。
- `squat` 排除了 41.6M 的印度頻道徒手深蹲對錯片（語言無法確認、非槓鈴深蹲）；若接受徒手深蹲可改用。
- 第三方影片可能下架或改為私人；`shortsStatus`／`thumbnailStatus` 只代表查核時點，建議上線後定期重跑 `scripts/shorts_detail.py`。
- 本輪完全沒有碰 YouTube Data API，只用公開搜尋頁與 Shorts 頁；YouTube 有對 `/watch` 頁出 reCAPTCHA，但 `/shorts` 與搜尋頁未受影響。
- 工作檔：`/tmp/claude-0/-home-user-daily-ten/3ac32758-328d-5253-ab17-a4f8e18cf355/scratchpad/yt/`（merged.json、shorts_status.txt、details_final.jsonl、thumbs/、scripts/）。
