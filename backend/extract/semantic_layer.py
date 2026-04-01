"""
Semantic Layer

從各區塊中提取語意資訊。
- 將文字內容轉換為具意義的資訊單位
- 區分不同類型資訊（文章資訊與互動資訊）
- 不再關心畫面排版，開始具備「資料語意」
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional

from .section_layer import Section


# ── 文章標頭解析 ──────────────────────────────────────────────
# 範例：
#   作者  username (暱稱) 看板  BoardName
#   標題  [問卦] 文章標題
#   時間  Wed Apr  1 12:00:00 2026
_RE_AUTHOR = re.compile(r"作者\s+(\S+)")
_RE_TITLE  = re.compile(r"標題\s+(.+)")
_RE_TIME   = re.compile(r"時間\s+(.+)")

# ── 推文解析 ──────────────────────────────────────────────────
# 範例：推 username: 這篇不錯                             04/01 12:30
_RE_PUSH = re.compile(
    r"^(推|噓|→)\s+(\S+):\s*(.*?)\s+(\d{2}/\d{2}\s+\d{2}:\d{2})$"
)

# ── 看板文章列表行解析 ────────────────────────────────────────
# PTT 看板行格式（固定寬度 80 欄 terminal）：
#   [標記] [文章編號] [人氣] [日期] [作者] [標題]
# 標記可為 ●/+/> 或空白；人氣可為 爆/XX/X數字/數字/空白
# 範例：
#   10000 爆  4/01 user     標題文字
#    9999    4/01 user2    Re: [問卦] 回覆標題
#  > 9998 10  4/01 user3    [新聞] 某某新聞
_RE_BOARD_ARTICLE = re.compile(
    r"^\D{0,3}(\d+)\s*(爆|XX?|X\d|\d{1,3})?\s+(\d{1,2}/\d{2})\s+(\S+)\s+(.+)$"
)


@dataclass
class ArticleHeader:
    author: Optional[str] = None
    title: Optional[str] = None
    time: Optional[str] = None
    board: Optional[str] = None


@dataclass
class Push:
    push_type: str      # "push" | "boo" | "arrow"
    user: str
    content: str
    time: str


@dataclass
class ArticleSummary:
    """看板列表中單篇文章的摘要"""
    index: int
    popularity: str         # "爆" | "XX" | 數字 | ""
    date: str
    author: str
    title: str


# ── Semantic Layer ────────────────────────────────────────────

class ArticleSemanticLayer:
    """
    從文章各區段抽取語意：
    - header section → ArticleHeader
    - body section   → 純文字正文
    - pushes section → List[Push]
    """

    def extract_header(self, section: Section) -> ArticleHeader:
        info = ArticleHeader()
        for line in section.lines:
            m = _RE_AUTHOR.search(line)
            if m:
                info.author = m.group(1)
            m = _RE_TITLE.search(line)
            if m:
                info.title = m.group(1).strip()
            m = _RE_TIME.search(line)
            if m:
                info.time = m.group(1).strip()
        return info

    def extract_body(self, section: Section) -> str:
        """回傳正文純文字（移除空行首尾）"""
        lines = section.lines
        # 去除首尾空行
        while lines and not lines[0].strip():
            lines = lines[1:]
        while lines and not lines[-1].strip():
            lines = lines[:-1]
        return "\n".join(lines)

    def extract_pushes(self, section: Section) -> List[Push]:
        pushes = []
        for line in section.lines:
            m = _RE_PUSH.match(line)
            if m:
                type_char, user, content, ts = m.groups()
                push_type = {"推": "push", "噓": "boo", "→": "arrow"}.get(type_char, "arrow")
                pushes.append(Push(push_type=push_type, user=user, content=content, time=ts))
        return pushes


class BoardSemanticLayer:
    """
    從看板列表區段抽取語意：
    - article_list section → List[ArticleSummary]
    """

    def extract_articles(self, section: Section) -> List[ArticleSummary]:
        articles = []
        for line in section.lines:
            m = _RE_BOARD_ARTICLE.match(line)
            if m:
                index_str, pop, date, author, title = m.groups()
                articles.append(
                    ArticleSummary(
                        index=int(index_str),
                        popularity=(pop or "").strip(),
                        date=date,
                        author=author,
                        title=title.strip(),
                    )
                )
        return articles
