"""
Session Manager

管理多個並行的 PTT session，提供 session_id 對應到 PTTSession 的映射。
"""

import uuid
import logging
from typing import Dict, Optional

from connection.ptt_client import PTTSession

logger = logging.getLogger(__name__)


class SessionManager:
    def __init__(self):
        self._sessions: Dict[str, PTTSession] = {}

    def create_session(self) -> str:
        """建立一個新的 PTT session，回傳 session_id"""
        session_id = f"sess-{uuid.uuid4().hex[:12]}"
        self._sessions[session_id] = PTTSession()
        logger.info(f"Session created: {session_id}")
        return session_id

    def get(self, session_id: str) -> Optional[PTTSession]:
        return self._sessions.get(session_id)

    async def close_session(self, session_id: str) -> None:
        session = self._sessions.pop(session_id, None)
        if session:
            try:
                await session.disconnect()
            except Exception as e:
                logger.warning(f"Error closing session {session_id}: {e}")
            logger.info(f"Session closed: {session_id}")

    async def close_all(self) -> None:
        for sid in list(self._sessions.keys()):
            await self.close_session(sid)


# 全域 singleton
session_manager = SessionManager()
