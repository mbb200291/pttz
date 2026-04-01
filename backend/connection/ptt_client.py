"""
Transport Layer

負責與 PTT 建立連線並取得資料。
- 建立 TCP / Telnet 連線
- 維持 session 狀態（登入、瀏覽位置）
- 接收連續的 terminal 輸出資料
"""

import asyncio
import logging
from typing import AsyncGenerator, Optional

logger = logging.getLogger(__name__)

PTT_HOST = "ptt.cc"
PTT_PORT = 23

# Key codes for PTT navigation
KEY_ENTER = b"\r"
KEY_SPACE = b" "
KEY_UP = b"\x1b[A"
KEY_DOWN = b"\x1b[B"
KEY_LEFT = b"\x1b[D"
KEY_RIGHT = b"\x1b[C"
KEY_Q = b"q"
KEY_LEFT_ARROW = b"\x1b[D"
KEY_N = b"n"
KEY_Y = b"y"


class PTTConnection:
    """
    低階連線管理，負責與 PTT Telnet 伺服器的 TCP 連線。
    不處理任何語意，僅提供原始 byte stream。
    """

    def __init__(self, host: str = PTT_HOST, port: int = PTT_PORT):
        self.host = host
        self.port = port
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected and self._writer is not None and not self._writer.is_closing()

    async def connect(self) -> None:
        """建立 TCP 連線至 PTT"""
        logger.info(f"Connecting to {self.host}:{self.port}")
        self._reader, self._writer = await asyncio.open_connection(self.host, self.port)
        self._connected = True
        logger.info("Connected to PTT")

    async def disconnect(self) -> None:
        """關閉連線"""
        if self._writer:
            self._writer.close()
            try:
                await self._writer.wait_closed()
            except Exception:
                pass
        self._connected = False
        logger.info("Disconnected from PTT")

    async def send(self, data: bytes) -> None:
        """送出原始 bytes 至 PTT"""
        if not self.is_connected:
            raise RuntimeError("Not connected")
        self._writer.write(data)
        await self._writer.drain()

    async def send_key(self, key: bytes) -> None:
        """送出按鍵"""
        await self.send(key)

    async def read_chunk(self, timeout: float = 0.5) -> bytes:
        """
        讀取一段資料（最多 4096 bytes），逾時則回傳目前收到的內容。
        """
        if not self.is_connected:
            return b""
        try:
            data = await asyncio.wait_for(
                self._reader.read(4096),
                timeout=timeout,
            )
            return data
        except asyncio.TimeoutError:
            return b""
        except Exception as e:
            logger.error(f"Read error: {e}")
            self._connected = False
            return b""

    async def stream(self, chunk_timeout: float = 0.3) -> AsyncGenerator[bytes, None]:
        """
        持續產生從 PTT 收到的資料 chunk，直到連線關閉。
        """
        while self.is_connected:
            chunk = await self.read_chunk(timeout=chunk_timeout)
            if chunk:
                yield chunk
            elif not self.is_connected:
                break


class PTTSession:
    """
    PTT session 管理，負責維持登入狀態與目前導覽位置。
    組合 PTTConnection 來提供高階的連線 + 狀態管理。
    """

    def __init__(self):
        self.connection = PTTConnection()
        self.location: str = "unknown"  # home | board | article | unknown
        self.current_board: Optional[str] = None
        self.current_article_id: Optional[str] = None
        self.logged_in: bool = False

    async def connect(self) -> None:
        await self.connection.connect()
        # 等待初始歡迎畫面
        await asyncio.sleep(1.5)
        await self._read_until_stable()

    async def disconnect(self) -> None:
        await self.connection.disconnect()
        self.location = "unknown"
        self.logged_in = False

    async def _read_until_stable(self, timeout: float = 2.0, idle: float = 0.3) -> bytes:
        """讀取直到畫面穩定（短時間內無新資料）"""
        buffer = b""
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            chunk = await self.connection.read_chunk(timeout=idle)
            if chunk:
                buffer += chunk
                # 收到新資料就重設截止時間
                deadline = asyncio.get_event_loop().time() + idle
            else:
                break
        return buffer

    def _decode_big5(self, data: bytes) -> str:
        """把 bytes 用 big5 解碼，方便分析畫面內容"""
        return data.decode("big5", errors="replace")

    async def login(self, username: str, password: str) -> bytes:
        """
        送出帳號密碼登入 PTT，自動處理：
        - 重複登入警告（刪除舊連線）
        - 新信件通知
        - 系統公告
        回傳最終穩定後的原始畫面資料
        """
        buffer = b""

        # 送出帳號
        await self.connection.send(username.encode("big5", errors="replace") + KEY_ENTER)
        await asyncio.sleep(0.8)

        # 送出密碼
        await self.connection.send(password.encode("big5", errors="replace") + KEY_ENTER)
        await asyncio.sleep(1.5)

        # 讀取登入後的回應，最多重試幾次以處理多個插入畫面
        for _ in range(6):
            chunk = await self._read_until_stable(timeout=3.0, idle=0.4)
            if chunk:
                buffer += chunk
            text = self._decode_big5(buffer)

            # 處理「重複登入」警告 - 選擇不刪除舊連線 (n)
            if "刪除其他重複登入" in text or "您想刪除" in text or "踢掉" in text:
                logger.info("Handling duplicate login prompt (sending 'n')")
                await self.connection.send(KEY_N + KEY_ENTER)
                await asyncio.sleep(1.0)
                buffer = b""
                continue

            # 處理「您想繼續嗎」或「按任意鍵繼續」
            if "按任意鍵繼續" in text or "請按任意鍵" in text:
                logger.info("Handling 'press any key' prompt")
                await self.connection.send(KEY_ENTER)
                await asyncio.sleep(0.5)
                buffer = b""
                continue

            # 處理公告或系統訊息（畫面底部有 [Space] 繼續）
            if "[空白]" in text or "space" in text.lower() or "繼續" in text:
                logger.info("Handling announcement/notification screen")
                await self.connection.send(KEY_SPACE)
                await asyncio.sleep(0.5)
                buffer = b""
                continue

            # 判斷是否已進入主畫面（有看板/信箱/最愛等選項）
            if "主功能表" in text or "精華區" in text or "我的最愛" in text or "電子郵件" in text:
                logger.info("Successfully reached main menu")
                break

            # 若仍有資料持續到來，繼續等待
            if not chunk:
                break

        logger.info("[login] buffer total=%d bytes", len(buffer))
        if buffer:
            logger.info("[login] first 80 bytes: %r", buffer[:80])
        self.logged_in = True
        self.location = "home"
        return buffer

    async def send_key(self, key: bytes) -> bytes:
        """送出按鍵並回傳畫面更新"""
        await self.connection.send_key(key)
        await asyncio.sleep(0.3)
        return await self._read_until_stable(timeout=1.5)

    async def enter_board(self, board: str) -> bytes:
        """
        進入指定看板。
        從主選單使用 s<看板名稱>Enter 進板，若有確認提示自動處理。
        """
        buffer = b""

        # 先確保回到主功能表（按幾次 q 或 左方向鍵）
        for _ in range(3):
            await self.connection.send(KEY_Q)
            await asyncio.sleep(0.2)
        await self._read_until_stable(timeout=1.0)

        # 發送「s<看板名稱>Enter」進入看板
        cmd = b"s" + board.encode("big5", errors="replace") + KEY_ENTER
        await self.connection.send(cmd)
        await asyncio.sleep(1.0)

        # 讀取並處理可能的確認畫面
        for _ in range(4):
            chunk = await self._read_until_stable(timeout=2.0, idle=0.4)
            if chunk:
                buffer += chunk
            text = self._decode_big5(buffer)

            # 若找到看板（文章列表有數字行）或確認進入看板
            if "文章選讀" in text or "看板《" in text or "Board:" in text:
                logger.info(f"Successfully entered board: {board}")
                break

            # 若出現「找不到」或需要重新確認
            if "找不到" in text or "不存在" in text:
                logger.warning(f"Board not found: {board}")
                break

            # 若出現「請按任意鍵」
            if "按任意鍵" in text:
                await self.connection.send(KEY_ENTER)
                await asyncio.sleep(0.5)
                buffer = b""
                continue

            if not chunk:
                break

        self.location = "board"
        self.current_board = board
        return buffer

    async def go_to_article(self, index: int) -> bytes:
        """以數字索引跳至指定文章"""
        cmd = str(index).encode("ascii") + KEY_ENTER
        await self.connection.send(cmd)
        await asyncio.sleep(0.5)
        data = await self._read_until_stable(timeout=2.0)
        self.location = "article"
        return data

    async def next_page(self) -> bytes:
        return await self.send_key(KEY_SPACE)

    async def prev_page(self) -> bytes:
        return await self.send_key(KEY_UP)

    async def next_article(self) -> bytes:
        data = await self.send_key(KEY_RIGHT)
        self.location = "article"
        return data

    async def prev_article(self) -> bytes:
        data = await self.send_key(KEY_LEFT_ARROW)
        self.location = "article"
        return data

    async def go_back(self) -> bytes:
        data = await self.send_key(KEY_Q)
        if self.location == "article":
            self.location = "board"
        elif self.location == "board":
            self.location = "home"
        return data
