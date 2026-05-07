// Mock PTT data for the prototype.
// Boards, articles, pushes — feels like a real Gossiping/Tech-N day.

const POPULAR_BOARDS = [
  { name: "Gossiping", zh: "八卦板",  online: 12483, today: 8421, hot: true },
  { name: "Stock",     zh: "股票板",  online:  4218, today: 3104 },
  { name: "NBA",       zh: "籃球板",  online:  3821, today: 2210 },
  { name: "C_Chat",    zh: "西恰",    online:  6512, today: 5102, hot: true },
  { name: "MobileComm",zh: "手機板",  online:  1843, today:  812 },
  { name: "Tech_Job",  zh: "科技業",  online:  2104, today: 1532 },
  { name: "movie",     zh: "電影板",  online:   982, today:  421 },
  { name: "BabyMother",zh: "親子板",  online:   612, today:  281 },
  { name: "HatePolitics", zh:"政黑板",online:  3201, today: 2812 },
  { name: "Lifeismoney",  zh:"省錢板",online:  1421, today:  892 },
  { name: "Boy-Girl",  zh: "男女板",  online:   702, today:  341 },
  { name: "car",       zh: "汽車板",  online:   821, today:  402 },
];

const RECENT_BOARDS = ["Gossiping", "Tech_Job", "Stock", "C_Chat"];
const FAVORITE_BOARDS = [
  { name: "Tech_Job",  zh: "科技業",  online:  2104, today: 1532, note: "求職薪水情報" },
  { name: "Stock",     zh: "股票板",  online:  4218, today: 3104, note: "盤中追蹤" },
  { name: "C_Chat",    zh: "西恰",    online:  6512, today: 5102, note: "ACG 日常" },
  { name: "movie",     zh: "電影板",  online:   982, today:  421, note: "週末選片" },
  { name: "Lifeismoney", zh: "省錢板", online: 1421, today:  892, note: "優惠通報" },
];

// Article list — board: Gossiping
const ARTICLES = [
  { idx: 30221, push: "爆", date: "04/28", author: "catlover",   title: "[新聞] 台北捷運深夜班次明年加開，網友：終於",  category: "新聞", replies: 318, fixed: false },
  { idx: 30220, push: "99", date: "04/28", author: "marketWatch",title: "[討論] 美股這波修正你還在All-in 嗎？",        category: "討論", replies:  87 },
  { idx: 30219, push: "X3", date: "04/28", author: "rant_man",   title: "Re: [問卦] 為什麼便利商店咖啡越來越難喝", category: "問卦", replies:  42, isReply: true },
  { idx: 30218, push: "32", date: "04/28", author: "devguy",     title: "[心得] 從 React 切到 Solid 三個月後感想",   category: "心得", replies:  61 },
  { idx: 30217, push: "78", date: "04/28", author: "newsbot",    title: "[新聞] 央行升息半碼，房貸族哀號",            category: "新聞", replies:  144 },
  { idx: 30216, push: " 8", date: "04/28", author: "lurker",     title: "[問題] 台北哪裡有不錯的安靜咖啡店推薦",     category: "問題", replies:  19 },
  { idx: 30215, push: "X1", date: "04/28", author: "hater",      title: "Re: [新聞] 台北捷運深夜班次明年加開",        category: "新聞", replies:  12, isReply: true },
  { idx: 30214, push: "21", date: "04/28", author: "foodie",     title: "[食記] 大稻埕新開的麵店真的滿好吃",          category: "食記", replies:  38 },
  { idx: 30213, push: "—",  date: "04/28", author: "deleted",    title: "(已被刪除) [公告] 板規修訂草案",              category: "公告", deleted: true },
  { idx: 30212, push: "55", date: "04/28", author: "techguru",   title: "[情報] M5 MacBook Pro 跑分洩漏",              category: "情報", replies:  94 },
  { idx: 30211, push: "12", date: "04/28", author: "dailylife",  title: "[閒聊] 今天天氣真的好",                      category: "閒聊", replies:  20 },
  { idx: 30210, push: "爆", date: "04/28", author: "breakingnow",title: "[新聞] 颱風路徑生變，週末可能直撲北部",       category: "新聞", replies: 412, fixed: false },
  { idx: 30209, push: "44", date: "04/27", author: "studyabroad",title: "[心得] 在德國讀書一年觀察",                   category: "心得", replies:  72 },
  { idx: 30208, push: "X5", date: "04/27", author: "angry_man",  title: "Re: [討論] 美股這波修正你還在All-in 嗎？",   category: "討論", replies:  29, isReply: true },
  { idx: 30207, push: " 5", date: "04/27", author: "ask_me",     title: "[問卦] 為什麼週日總是過特別快？",             category: "問卦", replies:  11 },
  { idx: 30206, push: "27", date: "04/27", author: "randomdev",  title: "[請益] 第一份工作 startup vs 大廠如何選",     category: "請益", replies:  53 },
  { idx: 30205, push: "63", date: "04/27", author: "filmfan",    title: "[負雷] 復仇者聯盟5 看完只想睡",              category: "負雷", replies:  88 },
  { idx: 30204, push: "18", date: "04/27", author: "lifehacker", title: "[心得] 我用 7 天養成早起習慣",                category: "心得", replies:  29 },
];

// Pinned articles for board top
const PINNED = [
  { idx: 30000, push: "M ", date: "01/01", author: "Moderator",  title: "[公告] Gossiping 板規 v9.1（請務必詳讀）", pinned: true },
  { idx: 30001, push: "M ", date: "03/15", author: "Moderator",  title: "[公告] 違規警告/水桶名單 整理串",            pinned: true },
];

// Article — full reading view
const ARTICLE = {
  board: "Gossiping",
  aid: "1aBcDeF2",
  idx: 30221,
  category: "新聞",
  title: "[新聞] 台北捷運深夜班次明年加開，網友：終於",
  author: "catlover",
  authorZh: "貓貓粉絲俱樂部",
  date: "Mon Apr 28 02:14:09 2026",
  ip: "118.232.10.22",
  pushTotal: 318,
  booTotal: 12,
  neutralTotal: 41,
  body: `1.媒體來源：
中央社

2.記者署名：
記者 王大明

3.完整新聞標題：
台北捷運深夜班次明年加開 通勤族與夜貓族都受惠

4.完整新聞內文：
台北捷運公司今(28)日宣布，將於明年第一季起加開深夜班次，週末末班車延長至凌晨 1 點 30 分，預計受惠人次每日逾 3 萬人。北捷強調，相關安全與運輸成本評估皆已完成，未來將視運量持續調整時刻。

捷運局長李大華表示：「我們聽到了通勤族與夜班朋友的心聲。延長深夜服務對城市夜經濟、機場接駁與大型活動疏運皆有正面效應。」

新時刻表預計於 2026 年 12 月公告，民眾可透過北捷 App 查詢。

5.完整新聞連結 (或短網址)：
https://www.example.com/news/20260428-mrt-late-night

6.備註：
個人覺得這真的等了好幾年，希望能順利上路。`,
  edits: [
    { marker: "※ 編輯", content: "catlover (118.232.10.22), 04/28/2026 02:34:00", note: "補上連結" },
  ],
};

// Pushes — flat list with replyTo wiring
const PUSHES = [
  { id: "p1",  type: "push",    author: "marketWatch", time: "04/28 02:18", ip: "61.220.10.4", floor: 1,
    content: "終於！等這個等了至少十年欸 真的是德政", score: 28, replyTo: null },
  { id: "p2",  type: "push",    author: "rant_man",    time: "04/28 02:19", ip: "118.231.5.21", floor: 2,
    content: "回1樓：等你晚上加班過就知道有多需要 || 真的不是說笑", score: 4, replyTo: "p1", isOP: false },
  { id: "p3",  type: "boo",     author: "hater",       time: "04/28 02:20", ip: "210.71.99.2",  floor: 3,
    content: "深夜開那麼晚 司機累死 又增加成本 誰買單", score: -2, replyTo: null },
  { id: "p4",  type: "push",    author: "catlover",    time: "04/28 02:21", ip: "118.232.10.22",floor: 4,
    content: "回3樓：人家都評估完了 你不要那麼急著噓", score: 12, replyTo: "p3", isOP: true },
  { id: "p5",  type: "neutral", author: "lurker_99",   time: "04/28 02:22", ip: "203.69.42.10", floor: 5,
    content: "->4f：好奇成本評估報告在哪可以看到？", score: 0, replyTo: "p4" },
  { id: "p6",  type: "push",    author: "catlover",    time: "04/28 02:23", ip: "118.232.10.22",floor: 6,
    content: "回5樓：報告連結補在#5 編輯區了，可以翻一下", score: 3, replyTo: "p5", isOP: true },
  { id: "p7",  type: "push",    author: "newsbot",     time: "04/28 02:25", ip: "59.124.10.1",  floor: 7,
    content: "推 終於不用搶最後一班車的瘋狂感", score: 18, replyTo: null },
  { id: "p8",  type: "push",    author: "devguy",      time: "04/28 02:27", ip: "61.230.10.51", floor: 8,
    content: "對機場線真的有差 凌晨班機族哭哭", score: 9, replyTo: null },
  { id: "p9",  type: "boo",     author: "skeptic",     time: "04/28 02:28", ip: "111.235.10.1", floor: 9,
    content: "看時刻表再說啦 這種承諾以前也聽過", score: 0, replyTo: null },
  { id: "p10", type: "push",    author: "foodie",      time: "04/28 02:30", ip: "210.59.10.4",  floor: 10,
    content: "希望宵夜場吃完不用再叫小黃了", score: 22, replyTo: null },
  { id: "p11", type: "neutral", author: "ask_me",      time: "04/28 02:31", ip: "203.69.10.2",  floor: 11,
    content: "->10f：哪裡的宵夜場？想跟", score: 1, replyTo: "p10" },
  { id: "p12", type: "push",    author: "filmfan",     time: "04/28 02:33", ip: "61.220.42.1",  floor: 12,
    content: "看完午夜場終於可以走捷運回家", score: 14, replyTo: null },
  { id: "p13", type: "push",    author: "studyabroad", time: "04/28 02:35", ip: "59.115.10.5",  floor: 13,
    content: "倫敦也是這樣慢慢延長 結果現在24小時 願景值得期待", score: 31, replyTo: null },
  { id: "p14", type: "boo",     author: "skeptic",     time: "04/28 02:36", ip: "111.235.10.1", floor: 14,
    content: "回13樓：台北人口密度跟倫敦差很多 不要亂類比", score: -3, replyTo: "p13" },
  { id: "p15", type: "push",    author: "techguru",    time: "04/28 02:38", ip: "118.160.10.9", floor: 15,
    content: "希望也能順便升級行控系統 別到時候誤點變家常", score: 6, replyTo: null },
  { id: "p16", type: "edit",    author: "catlover",    time: "04/28 02:34", ip: "118.232.10.22",floor: 0,
    content: "補上連結", score: 0, replyTo: "p5", isOP: true, marker: "作者編輯" },
  { id: "p17", type: "push",    author: "dailylife",   time: "04/28 02:40", ip: "203.69.10.55", floor: 16,
    content: "推 早上看到第一篇就推爆", score: 8, replyTo: null },
  { id: "p18", type: "push",    author: "lifehacker",  time: "04/28 02:41", ip: "210.59.42.2",  floor: 17,
    content: "回16樓：哈哈我也是 終於有好消息", score: 2, replyTo: "p17" },
  { id: "p19", type: "neutral", author: "randomdev",   time: "04/28 02:43", ip: "59.124.42.1",  floor: 18,
    content: "希望末班車再延30分 機場線最需要", score: 0, replyTo: null },
  { id: "p20", type: "push",    author: "breakingnow", time: "04/28 02:46", ip: "118.232.42.1", floor: 19,
    content: "下週開記者會嗎？想看新聞局怎麼包裝", score: 4, replyTo: null },
  { id: "p21", type: "push",    author: "foodie",      time: "04/28 02:50", ip: "210.59.10.4",  floor: 20,
    content: "->19f：通常一週內會有正式公告", score: 5, replyTo: "p20" },
];

const CURRENT_USER = "pttzzz";

window.PTTZZZ_DATA = { POPULAR_BOARDS, RECENT_BOARDS, FAVORITE_BOARDS, ARTICLES, PINNED, ARTICLE, PUSHES, CURRENT_USER };
