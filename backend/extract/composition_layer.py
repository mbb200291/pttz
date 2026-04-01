"""
Composition Layer

將不同來源的語意資訊整合，建立完整的文章/看板表示。
- 合併各區塊的資訊
- 建立完整的文章表示
- 保持欄位間的一致性
- 不新增新資訊，僅負責整合與組裝
"""

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

from .section_layer import Section, ArticleSectionLayer, BoardSectionLayer
from .semantic_layer import (
    ArticleSemanticLayer,
    BoardSemanticLayer,
    ArticleHeader,
    Push,
    ArticleSummary,
)
from .text_layer import TextLayer


@dataclass
class ArticleData:
    """完整的文章資料（Composition Layer 的輸出）"""
    id: Optional[str]
    board: Optional[str]
    author: Optional[str]
    title: Optional[str]
    time: Optional[str]
    content: str
    pushes: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class BoardData:
    """完整的看板資料（Composition Layer 的輸出）"""
    board: str
    articles: List[Dict[str, Any]] = field(default_factory=list)
    cursor: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ArticleComposer:
    """
    整合 Text → Section → Semantic 各層輸出，
    組裝成一個完整的 ArticleData。
    """

    def __init__(self):
        self._text = TextLayer()
        self._section = ArticleSectionLayer()
        self._semantic = ArticleSemanticLayer()

    def compose(
        self,
        raw_lines: List[str],
        article_id: Optional[str] = None,
        board: Optional[str] = None,
    ) -> ArticleData:
        # 1. Text Layer
        lines = self._text.process(raw_lines)

        # 2. Section Layer
        sections = self._section.process(lines)
        section_map: Dict[str, Section] = {s.kind: s for s in sections}

        # 3. Semantic Layer
        header_info = ArticleHeader()
        if "header" in section_map:
            header_info = self._semantic.extract_header(section_map["header"])

        body_text = ""
        if "body" in section_map:
            body_text = self._semantic.extract_body(section_map["body"])

        pushes: List[Push] = []
        if "pushes" in section_map:
            pushes = self._semantic.extract_pushes(section_map["pushes"])

        # 4. Composition：整合組裝
        return ArticleData(
            id=article_id,
            board=board or header_info.board,
            author=header_info.author,
            title=header_info.title,
            time=header_info.time,
            content=body_text,
            pushes=[
                {
                    "type": p.push_type,
                    "user": p.user,
                    "content": p.content,
                    "time": p.time,
                }
                for p in pushes
            ],
        )


class BoardComposer:
    """
    整合 Text → Section → Semantic 各層輸出，
    組裝成一個完整的 BoardData。
    """

    def __init__(self):
        self._text = TextLayer()
        self._section = BoardSectionLayer()
        self._semantic = BoardSemanticLayer()

    def compose(
        self,
        raw_lines: List[str],
        board_name: str,
        cursor: Optional[str] = None,
    ) -> BoardData:
        # 1. Text Layer
        lines = self._text.process(raw_lines)

        # 2. Section Layer
        sections = self._section.process(lines)
        section_map: Dict[str, Section] = {s.kind: s for s in sections}

        # 3. Semantic Layer
        summaries: List[ArticleSummary] = []
        if "article_list" in section_map:
            summaries = self._semantic.extract_articles(section_map["article_list"])

        # 4. Composition
        return BoardData(
            board=board_name,
            articles=[
                {
                    "id": str(a.index),
                    "title": a.title,
                    "author": a.author,
                    "date": a.date,
                    "popularity": a.popularity,
                }
                for a in summaries
            ],
            cursor=cursor,
        )
