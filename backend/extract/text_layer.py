"""
Text Layer

將畫面轉換為可處理的純文字。
- 將畫面內容轉為 line-based text
- 消除與顯示相關的干擾（如控制碼）
- 保證輸出格式穩定
"""

import re
from typing import List


# 移除 ANSI escape codes
_ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*[mABCDHJKsu]|\x1b\[?[0-9;]*[hl]")


def strip_ansi(text: str) -> str:
    """移除 ANSI escape sequences"""
    return _ANSI_ESCAPE.sub("", text)


def normalize_line(line: str) -> str:
    """
    正規化單一行：
    - 移除 ANSI 控制碼
    - 保留尾部空白清除（rstrip）
    """
    return strip_ansi(line).rstrip()


class TextLayer:
    """
    將 TerminalScreen 的畫面輸出轉換為穩定的純文字行列表。
    輸出：可逐行存取、順序穩定、可供後續切分的字串列表。
    """

    def process(self, raw_lines: List[str]) -> List[str]:
        """
        接收畫面的原始行列表（來自 TerminalScreen.get_lines()），
        回傳清理後的純文字行列表。
        """
        return [normalize_line(line) for line in raw_lines]
