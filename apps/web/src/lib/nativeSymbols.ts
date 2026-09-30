/** Curated visible glyphs that round-trip through ptt-client's UAO codec.
 * Static data avoids shipping an extra encoding table to render the picker.
 * No variation selectors: inserting one would change transport compatibility.
 */
export const NATIVE_SYMBOL_GROUPS = [
  { name: "常用圖案", symbols: "☺☻☹♥♡✈✉☎✂☁☂☼☽★☆✩✡✽♪♬☑☒✓✕☛☜☞☟☠☯♀♂♠♢♣♤♦♧❏☰☱☲☳☴☵☶☷" },
  { name: "箭頭", symbols: "←↑→↓↔↕↖↗↘↙↨↲↸↹⇋⇔⇦⇧⇨⇩" },
  { name: "數學", symbols: "∀∂∃∈∋∕√∞∟∠∣∥∩∪∫∬∮∴∵∷≒≠≡≦≧⊂⊃⊆⊇⊕⊙⊥⊿" },
  { name: "幾何圖形", symbols: "■□▲△▶▼▽◄◆◇○◎●◘◙◢◣◤◥" },
  { name: "框線", symbols: "─━│┃┌┐└┘├┤┬┴┼╎═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬╭╮╯╰╱╲╳╴" },
  { name: "色塊", symbols: "▁▂▃▄▅▆▇█▉▊▋▌▍▎▏▓▔▕" },
  { name: "數字", symbols: "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⑾⑿⒀⒁⒂⒃⒄⒅⒆⒇⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑⒒⒓⒔⒕⒖⒗⒘⒙⒚⒛⓪❶❷❸❹❺❻❼❽❾❿" },
  { name: "圈字母", symbols: "⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ" },
  { name: "標點與單位", symbols: "®™℡№℃℉℅℞§¶‡※‧…‥‰′‵￥€￠￡¤±×÷﹏﹋﹌﹍﹎﹉﹊〃々〆〇〒〓〝〞【】〔〕〈〉《》「」『』﹁﹂﹃﹄㊣" },
] as const;
