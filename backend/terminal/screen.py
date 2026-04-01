"""
Terminal Stream Layer

負責承接來自 Transport 的原始輸出，使用 pyte 維護畫面狀態。
- 接收 terminal 畫面更新
- 維持畫面狀態（screen buffer 概念）
- 提供可讀取的畫面快照
"""

import logging
import re
import unicodedata
import pyte
from typing import List

logger = logging.getLogger(__name__)

# 比對 VT100/ANSI escape sequences（純 ASCII，不需轉換）
_ANSI_RE = re.compile(
    rb"\x1b\[[0-9;?]*[A-Za-z]"    # CSI: ESC [ <params> <final-letter>
    rb"|\x1b[()][0-9A-Za-z]"       # 字元集指定: ESC ( B / ESC ) 0 等（3字元）
    rb"|\x1b[^[]"                   # 其他 2 字元 ESC 序列（ESC + 非[字元）
    rb"|\x1b"                       # bare ESC（防呆）
)


def _strip_telnet(data: bytes) -> bytes:
    """移除 Telnet IAC 協議字元（0xFF 開頭的控制序列）"""
    result = bytearray()
    i = 0
    while i < len(data):
        b = data[i]
        if b == 0xFF:                          # IAC
            if i + 1 >= len(data):
                i += 1
                continue
            nb = data[i + 1]
            if nb == 0xFF:                     # IAC IAC → literal 0xFF
                result.append(0xFF)
                i += 2
            elif nb in (0xFB, 0xFC, 0xFD, 0xFE):  # WILL/WONT/DO/DONT + option
                i += 3
            elif nb == 0xFA:                   # SB subnegotiation, skip until IAC SE
                i += 2
                while i + 1 < len(data):
                    if data[i] == 0xFF and data[i + 1] == 0xF0:
                        i += 2
                        break
                    i += 1
            else:
                i += 2
        else:
            result.append(b)
            i += 1
    return bytes(result)


def _big5_to_utf8(data: bytes) -> bytes:
    """
    將 PTT 的 raw bytes（Telnet + ANSI + Big5）轉換為可供 pyte 使用的 UTF-8 bytes。
    1. 先去除 Telnet IAC 序列
    2. 保留 ANSI escape sequences（純 ASCII）不動
    3. 將文字片段從 Big5 解碼再重新編碼為 UTF-8
    """
    clean = _strip_telnet(data)
    result = bytearray()
    last_end = 0

    for m in _ANSI_RE.finditer(clean):
        start, end = m.span()
        # 文字片段（Big5）→ UTF-8
        if start > last_end:
            text = clean[last_end:start].decode("big5", errors="replace")
            result.extend(text.encode("utf-8"))
        # ANSI 序列保持原樣（本身就是 ASCII / valid UTF-8）
        result.extend(m.group())
        last_end = end

    # 最後一段文字
    if last_end < len(clean):
        text = clean[last_end:].decode("big5", errors="replace")
        result.extend(text.encode("utf-8"))

    return bytes(result)


SCREEN_ROWS = 24
SCREEN_COLS = 80


class TerminalScreen:
    """
    使用 pyte 維護 PTT terminal 畫面狀態。
    接收原始 bytes，輸出可讀的畫面文字。
    """

    def __init__(self, rows: int = SCREEN_ROWS, cols: int = SCREEN_COLS):
        self.rows = rows
        self.cols = cols
        self._screen = pyte.Screen(cols, rows)
        self._stream = pyte.ByteStream(self._screen)

    def feed(self, data: bytes) -> None:
        """
        將原始 terminal bytes 餵入 pyte，更新畫面狀態。
        使用 _big5_to_utf8() 精確地：
        1. 去除 Telnet IAC 序列
        2. 保留 ANSI escape sequences 不動
        3. 將文字片段從 Big5 轉換為 UTF-8
        """
        logger.info("[screen.feed] raw=%d bytes, first40=%r", len(data), data[:40])
        utf8_data = _big5_to_utf8(data)
        logger.info("[screen.feed] utf8=%d bytes, first40=%r", len(utf8_data), utf8_data[:40])
        self._stream.feed(utf8_data)

    def get_lines(self) -> List[str]:
        """
        回傳目前畫面每一行的純文字（共 rows 行）。
        處理 CJK 雙寬字元：每個雙寬字元佔 2 欄，跳過其後的 placeholder 空格。
        """
        lines = []
        for row_idx in range(self.rows):
            row = self._screen.buffer[row_idx]
            chars: List[str] = []
            col_idx = 0
            while col_idx < self.cols:
                char_data = row[col_idx].data if col_idx in row else " "
                chars.append(char_data)
                # 若為雙寬字元（east_asian_width = W 或 F），跳過下一個 placeholder 欄
                if char_data and char_data != " " and unicodedata.east_asian_width(char_data) in ("W", "F"):
                    col_idx += 2
                else:
                    col_idx += 1
            lines.append("".join(chars).rstrip())
        return lines

    def get_snapshot(self) -> str:
        """
        回傳整個畫面的文字快照（每行以 newline 分隔）。
        """
        return "\n".join(self.get_lines())

    def get_line(self, row: int) -> str:
        """取得指定行的文字（0-indexed）"""
        lines = self.get_lines()
        if 0 <= row < len(lines):
            return lines[row]
        return ""

    def get_cursor_position(self) -> tuple[int, int]:
        """回傳目前游標位置 (row, col)"""
        return (self._screen.cursor.y, self._screen.cursor.x)

    def reset(self) -> None:
        """重置畫面狀態"""
        self._screen = pyte.Screen(self.cols, self.rows)
        self._stream = pyte.ByteStream(self._screen)
