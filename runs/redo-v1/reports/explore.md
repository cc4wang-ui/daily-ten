# 探索任務池研究報告（explore.json v1）

產出：`data/explore.json`（version 1，67 個任務）。本報告只放方法、統計、查證來源與保留意見；網址只出現在這裡，JSON 內一律不含網址（App 禁止外部連結）。

## 1. 結論

- 67 個任務、8 類各 ≥8，超過規格（≥48、各 ≥6）。
- 41／67（61%）標為 `tier: "light"`＝在家可做，或外出但免費／¥1,000 以下、短時間；26 個是東京實地體驗（澀谷、新宿、下北澤、代官山、中目黑、淺草、藏前、築地、豊洲、上野、市谷、惠比壽、神宮外苑、小金井）。
- 每個實地體驗的「活動類型」都用 WebSearch 查到至少一個真實存在的例子（§4）；JSON 的 `hint` 只寫「搜尋『…』」或已查證的公共設施名，不寫未查證的店名。
- 自動檢查通過：id 唯一、kebab-case；title ≤14 字；無 URL；無 §11 禁用詞（窗口、時長、散點、數據、斷線、設置、撤銷、視頻、信息、收下、錨點、N 連）。

## 2. 分類統計

| 類別 | 數量 | light（在家／便宜） | field（東京實地） |
|---|---|---|---|
| 音樂 | 8 | 5 | 3 |
| 手作 | 8 | 3 | 5 |
| 料理 | 8 | 5 | 3 |
| 身體 | 9 | 4 | 5 |
| 戶外探索 | 8 | 6 | 2 |
| 文化 | 9 | 4 | 5 |
| 腦力 | 9 | 8 | 1 |
| 社交／表達 | 8 | 6 | 2 |
| **合計** | **67** | **41** | **26** |

費用分布（以級距下限計）：免費 34、¥1,000 以下 14、¥1,000–3,500 15、¥3,500 以上 4。時間分布：≤30 分鐘 27、31–60 分鐘 4、約 1 小時 12、1.5 小時以上 24。

## 3. 方法

1. 以 Cross 的設定（住東京、常去澀谷、「一週試一件新事物」）為前提，先列 8 類 × 在家／實地兩層，確保每類都有「今天就能做」的版本。
2. 每個實地體驗用 WebSearch（日文為主）確認「這種活動類型在東京真的存在、可單次參加、價格級距」；查到的實例與價格寫進本報告 §4，JSON 只保留可行的搜尋關鍵字。
3. `twoMinute` 一律寫「今天就能做的第一步」（查時段、買材料、開 app），`finish` 寫可勾選的具體完成條件，`hint` 寫怎麼找或第一個技巧。
4. 用 Python 腳本產生 JSON 並做自動檢查（id、字數、網址、禁用詞）；再跑 `tools/jev/check-glossary.js`。
5. 欄位依規格：`id, title, category, place, time, cost, twoMinute, finish, hint`，另加 `tier`（`light`／`field`）供 App 洗牌時控制「輕／重」比例；不需要可直接忽略或刪除。

## 4. 查證結果（活動類型 → 查到的實例與來源）

價格為搜尋結果當時的掲載值，會變動；只作為 JSON `cost` 級距的依據。

| 任務 id | 查到的活動類型／實例 | 來源 |
|---|---|---|
| chopsticks-making-shibuya | 澀谷站步行 5 分鐘內有筷子製作工房（Chopsticks Studio Shibuya 2026-08 開業；WAUG、じゃらん另有神南工房，60 分 ¥2,800 起） | https://resemom.jp/release/prtimes/20260817/205221.html 、https://www.waug.com/ja/activities/154888 、https://www.jalan.net/kankou/sta_990754/g2_S1/ |
| calligraphy-class-shibuya | 澀谷書道體驗：Japan Culture Experience（渋谷駅徒歩 4 分，書道＋茶道各約 1 小時）；Klook 和室書道教室 | https://san-tatsu.jp/pressrelease/462601/ 、https://www.waug.com/activities/154893 |
| tea-ceremony-first | 淺草／表參道茶道體驗，有桌席、英語；¥3,000–6,000 級距 | https://www.tokyoweekender.com/art_and_culture/japanese-culture/tokyo-japanese-tea-ceremony/ 、https://byfood.com/tokyo-tea-ceremony |
| bouldering-first-session | 新宿抱石館（UrbanBaseCamp 新宿等），初次含登錄費 ¥1,100、租鞋 | https://www.nta.co.jp/activity/culture/bouldering/kanto/tokyo/191/ 、https://aumo.jp/articles/51207 |
| kickboxing-trial | 新宿・澀谷踢拳體驗，免費～¥2,200（新宿レフティージム等） | https://aumo.jp/articles/2383343 、https://my-best.com/5254 |
| ward-pool-500m | 23 區區民泳池 1 小時 ¥200–250、2 小時 ¥400–500 常見；代官山スポーツプラザ 有個人利用 | https://financial-field.com/living/entry-197342 、https://www.timeout.jp/tokyo/ja/スポーツ/代官山スポーツプラザ-1 |
| ice-skating-gaien | 明治神宮外苑アイススケート場（新宿區，年中無休，初學教室） | https://www.jalan.net/kankou/130000/g2_T6/ |
| sento-sauna-first | 新宿黃金湯 ¥550（2026-07 重開）、渋谷SAUNAS ¥1,900 起 | https://sauna-ikitai.com/saunners/529961/ikitai 、https://onsen.nifty.com/ft-hotel/shibuya-onsen/ |
| aikido-or-kendo-trial | 渋谷区スポーツセンター 合氣道班（體驗 3 次免費，2026-07 刊登）；日本橋 Kendo Spirit、上野劍道體驗 | https://jmty.jp/tokyo/les-spo/article-1q1fwq 、https://www.tour.ne.jp/j_optional/888349/ |
| skateboard-first-push | 南千住 RAMP ZERO（東京メトロ高架下，初學免費體驗會＋スクール）；台場 H.L.N.A SKYGARDEN 有租借 | https://www.bcnretail.com/market/detail/20240313_408367.html 、https://resemom.jp/release/prtimes/20190319/52783.html |
| pottery-wheel-nakameguro | 中目黑電動轆轤一日體驗（千秋工房，中目黒駅徒歩 5 分，口碑 1,243 件） | https://www.asoview.com/leisure/act1109/location/are0138300/ 、https://www.veltra.com/jp/japan/tokyo/p/10920/ |
| leather-cardcase-kuramae | 藏前・淺草皮革體驗（Thorough Brace 蔵前、EIFUMI、卡夾 ¥2,900 起） | https://www.jalan.net/kankou/sta_990020/g2_P0/ |
| glass-bead-asakusa | 淺草江戶蜻蜓玉 ¥3,300 起；淺草橋 1 小時 ¥2,200 起 | https://www.asoview.com/leisure/act1112/location/prf130000/ 、https://www.jalan.net/activity/sta_990550/g2_K1/ |
| kintsugi-shibuya | 澀谷金繼體驗（材料器皿備妥）；南阿佐ヶ谷 2.5 小時一日體驗 | https://www.waug.com/ja/activities/160638 、https://www.veltra.com/jp/japan/tokyo/a/164286 |
| soba-making-class | 赤坂蕎麥打體驗 ¥6,000、葛飾 江戸東京そばの会 ¥4,950／150 分 | https://www.jalan.net/kankou/sta_990235/g2_C7/ |
| wagashi-nerikiri-class | 東京練切教室多家；淺草另有銅鑼燒體驗（JSON hint 已註明替代） | https://crexgroup.com/ja/travel/niche/tokyo-wagashi-making-class/ 、https://www.asoview.com/leisure/act1224/location/rgn04/ |
| sushi-or-ramen-class | 築地・月島 壽司＋拉麵 3 小時小班課 | https://livejapan.com/ja/in-tokyo/in-pref-tokyo/in-tsukiji/activity-indoor_activities/ac0141986/ 、https://www.byfood.com/ja/tokyo-ramen-classes |
| vinyl-dig-shimokita | 下北澤中古唱片行（フラッシュ・ディスク・ランチ 等；一番街商店街；11 點後開店） | https://www.gotokyo.org/jp/story/walks-and-tours/shimo-kitazawa/ 、https://aumo.jp/articles/112110 |
| ukulele-trial-lesson | 東京烏克麗麗免費體驗（Ohana-san 北區）、門前仲町一次完結班；島村樂器體驗 ¥2,200 | https://voix.jp/edu/?p=20065 、https://jmty.jp/tokyo/les-mus/article-zjdu2 |
| shamisen-trial | 上野・淺草津輕三味線小班體驗，約 70 分 ¥9,500 起（場地費另計） | https://www.asoview.com/item/activity/pln3000017778/ |
| dj-two-track-mix | 東京 DJ 體驗課存在（島村樂器有明、World DJ Academy 高井戸、出張課 ¥5,000／h），但澀谷一次性體驗未查到 → 任務改為在家 app 版，與 §6「第一個探索項目＝DJ」一致 | https://www.shimamura.co.jp/p/event/beginners-club/dj.html 、https://studychain.jp/interview/world-dj-academy/ |
| meguro-river-walk | 中目黑→代官山步行約 10 分；目黑川遊步道、高架下 | https://www.gotokyo.org/jp/destinations/southern-tokyo/nakameguro/ |
| shinjuku-gyoen-bench | 新宿御苑一般 ¥500；開園時間依季節；花季部分日期需預約 | https://www.env.go.jp/press/press_03164.html 、https://kaibutsu-blog.com/?p=3603 |
| tsukiji-outer-breakfast | 築地場外 9–13 時適合觀光；週三・週日多休；禁止邊走邊吃 | https://www.gotokyo.org/jp/kanko/chuo/spot/s_966.html 、https://macaro-ni.jp/128390 |
| toyosu-market-morning | 豊洲市場見學通道可看鮪魚拍賣；屋上綠化廣場 | https://www.gotokyo.org/jp/spot/1743/index.html |
| yose-suehirotei | 新宿末廣亭一般 ¥3,000、當日券、自由席；週六深夜寄席 ¥500–1,000 | https://www.enjoytokyo.jp/article/107876/ 、https://www.ozmall.co.jp/experience/rakugo/19033/ |
| tokyo-national-museum | 東京國立博物館總合文化展 一般 ¥1,000，週一休 | https://www.walkerplus.com/spot/ar0313s03560/price.html |
| edo-tokyo-tatemono | 江戶東京建物園 一般 ¥400；10–3 月 9:30–16:30；建議日期指定線上票 | https://www.gotokyo.org/jp/spot/417/index.html 、https://www.walkerplus.com/event/ar0313e578189/price.html |
| ikebana-trial | 京王プラザホテル（西新宿）草月流插花體驗 每月 2 次、¥3,000、約 45 分 | https://digitalpr.jp/r/34051 |
| nihon-kiin-trial | 日本棋院東京本院 圍棋學校 初次體驗 ¥550（2026-04 版簡介） | https://www.nihonkiin.or.jp/sisetsu/ichigaya/docs/igoschool_panf202604.pdf |
| boardgame-cafe-solo | 澀谷桌遊咖啡（ボドゲ東京 渋谷店 550 種以上；宇田川町店員教規則） | https://www.jalan.net/gourmet/sta_990775/g2_g13/ |
| cosmo-planetarium | コスモプラネタリウム渋谷 一般 ¥600→2026-07 起 ¥800；19:00 大人向；自由席 | https://www.tokyu.co.jp/area/shibuya/article/arti-01KGZVF7MVYMMBNTSKYQ9XV6VT/ 、https://www.gotokyo.org/jp/spot/575/index.html |
| mokumoku-meetup | connpass／TECH PLAY 上有澀谷もくもく会 | https://techplay.jp/event/668608 、https://tech-camp.in/note/?p=31839 |
| language-exchange-meetup | 新宿週四西日交換 ¥800；澀谷 Kokorogoto Cafe 中日交換；Meetup 為主要入口 | https://cotoacademy.com/where-to-find-japanese-language-exchange-event/ 、https://tokyointernationalmeetup.com/language-exchange/ |
| standup-open-mic-watch | Tokyo Comedy Bar（澀谷，2022 開業，每週 2 場 open mic，週四日語場） | https://yamatogokoro.jp/inboundnews/pickup/46311/ 、https://zh-hant.japantravel.com/tokyo/tokyo-comedy-bar/68928 |
| improv-show-ebisu | Pirates of Tokyo Bay 日英即興劇，每月週日晚惠比壽酒吧 | https://www.meetup.com/pirates-tokyo-improv-comedy/ |
| photo-walk-group | Meetup 多個初學者歡迎 photo walk（Tokyo Photography Group、TIFE 約 ¥1,000） | https://www.meetup.com/ja-JP/the-tokyo-photography-group 、https://metropolisjapan.com/events/street-photo-walk-tokyo-vol-2 |

在家任務（摺紙、手縫、速寫、手沖、溏心蛋、水餃、高湯、跳繩、瑜伽、毛筆、落語音訊、俳句、圍棋 app、Python、日文日記、數獨、記憶宮殿、vlog、自我介紹、傳訊息、新路線、公園）不需外部活動存在，未另外查證。

## 5. 保留意見

1. **澀谷 DJ 單次體驗未查到**：搜尋只找到有明、高井戶的 DJ 教室與出張課，澀谷沒有可確認的一次性體驗；因此 DJ 任務做成在家 app 版。若 Cross 想要實地版，建議之後用「渋谷 DJ 体験 1回」再查或問樂器行。
2. **melodica（鍵盤口風琴）體驗**：只找到過去的工作坊與學校活動，沒有澀谷常設的單次體驗，未納入；以「手機琴鍵」在家任務替代。
3. **價格會變**：JSON 的 `cost` 寫級距而非精確值；新宿御苑、Cosmo Planetarium、建物園等公共設施價格是 2026 年資料，其餘多為預約網站掲載值。
4. **部分活動是觀光客導向**（茶道、書道、筷子、三味線），價格偏高（¥3,000–9,500）；已在同類放便宜的在家版本平衡。
5. **代代木公園早晨太極拳／廣播體操**未查到固定團體，未納入；改為「住家附近公園走 10 分鐘」。
6. **渋谷区スポーツセンター 泳池價格**未查到正式表；任務改為「自己住的區的運動中心」並以 23 區常見價寫級距。
7. **新增欄位 `tier`** 超出規格欄位清單；用途是讓洗牌時控制輕重比例（例：每月至少 2 個 light）。若 schema 不收，直接刪除該欄位即可，不影響其他欄位。
8. 本輪未改動其他檔案；`sw.js` 預快取清單尚未加入 `data/explore.json`，由接手整合的節點處理（§9 DoD 第 2 條）。
