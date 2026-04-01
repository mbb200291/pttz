"""
Section Layer

將整段文字切分為具語意邊界的區塊。
- 根據畫面結構劃分區域
- 區分不同性質的內容（標頭、正文、推文區、狀態列）
- 不解析內容意義，僅負責「區段邊界辨識」
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Section:
    """代表畫面中的一個邏輯區塊"""
    kind: str           # "header" | "body" | "pushes" | "status_bar" | "board_list" | "unknown"
    lines: List[str] = field(default_factory=list)
    start_row: int = 0
    end_row: int = 0


class ArticleSectionLayer:
    """
    將文章畫面（24 行）切分為：
    - header:     前幾行（作者、標題、時間等）
    - body:       正文區
    - pushes:     推文區（以 推/噓/→ 開頭的行）
    - status_bar: 最後一行（畫面底部狀態列）
    """

    # 推文行識別：以「推」「噓」「→」開頭（含全形空格）
    _PUSH_PREFIXES = ("推 ", "噓 ", "→ ", "推　", "噓　", "→　")
    # 標頭分隔線（常見格式）
    _HEADER_SEPARATOR = "─" * 5  # 至少 5 個破折號

    def process(self, lines: List[str]) -> List[Section]:
        """
        將 24 行文章畫面切分為區段列表。
        """
        sections: List[Section] = []
        n = len(lines)
        if n == 0:
            return sections

        # 狀態列：最後一行
        status_bar = Section(kind="status_bar", lines=[lines[-1]], start_row=n - 1, end_row=n - 1)

        # 找標頭結束位置：尋找標頭分隔線
        header_end = self._find_header_end(lines)

        # 標頭區
        header = Section(
            kind="header",
            lines=lines[: header_end + 1],
            start_row=0,
            end_row=header_end,
        )
        sections.append(header)

        # 剩餘部分（排除狀態列）
        content_lines = lines[header_end + 1 : n - 1]
        content_start = header_end + 1

        # 切分正文與推文
        body_lines = []
        push_lines = []
        body_end = content_start
        push_start: Optional[int] = None
        in_push_section = False

        for i, line in enumerate(content_lines):
            abs_row = content_start + i
            if self._is_push_line(line):
                if push_start is None:
                    push_start = abs_row
                in_push_section = True
                push_lines.append(line)
            else:
                if in_push_section:
                    # 進入推文區之後，空行或非推文行直接跳過（不回歸正文）
                    continue
                body_lines.append(line)
                body_end = abs_row

        body = Section(
            kind="body",
            lines=body_lines,
            start_row=content_start,
            end_row=body_end,
        )
        sections.append(body)

        if push_lines:
            p_end = push_start + len(push_lines) - 1
            pushes = Section(
                kind="pushes",
                lines=push_lines,
                start_row=push_start,
                end_row=p_end,
            )
            sections.append(pushes)

        sections.append(status_bar)
        return sections

    def _find_header_end(self, lines: List[str]) -> int:
        """
        尋找標頭結束行（通常是分隔線）。
        如果找不到，預設前 4 行為標頭。
        """
        for i, line in enumerate(lines[:8]):
            if self._HEADER_SEPARATOR in line:
                return i
        return min(3, len(lines) - 1)

    def _is_push_line(self, line: str) -> bool:
        for prefix in self._PUSH_PREFIXES:
            if line.startswith(prefix):
                return True
        return False


class BoardSectionLayer:
    """
    將看板列表畫面切分為：
    - status_bar:  第 0 行（看板名稱 / 狀態）
    - article_list: 中間的文章列表行
    - nav_bar:     最後一行（導覽提示）
    """

    def process(self, lines: List[str]) -> List[Section]:
        n = len(lines)
        if n == 0:
            return []

        sections = [
            Section(kind="status_bar", lines=[lines[0]], start_row=0, end_row=0),
            Section(kind="article_list", lines=lines[1 : n - 1], start_row=1, end_row=n - 2),
            Section(kind="nav_bar", lines=[lines[-1]], start_row=n - 1, end_row=n - 1),
        ]
        return sections
