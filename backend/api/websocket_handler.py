"""
Application Layer – WebSocket Handler

實作 PTT WebSocket API Spec v1。
前端只送「操作意圖」，後端維持 PTT session，回傳「結構化狀態 JSON」。
"""

import json
import logging
from typing import Any, Dict, Optional

from fastapi import WebSocket, WebSocketDisconnect

from .session_manager import session_manager
from terminal.screen import TerminalScreen
from extract.composition_layer import ArticleComposer, BoardComposer

logger = logging.getLogger(__name__)

# 各 session 配對自己的 TerminalScreen
_screens: Dict[str, TerminalScreen] = {}
_article_composer = ArticleComposer()
_board_composer = BoardComposer()


def _ok(event_type: str, request_id: Optional[str], session_id: str, payload: Dict[str, Any]) -> str:
    return json.dumps({
        "type": event_type,
        "request_id": request_id,
        "session_id": session_id,
        "payload": payload,
    }, ensure_ascii=False)


def _error(request_id: Optional[str], session_id: Optional[str], code: str, message: str) -> str:
    return json.dumps({
        "type": "error",
        "request_id": request_id,
        "session_id": session_id,
        "payload": {"code": code, "message": message},
    }, ensure_ascii=False)


async def handle_websocket(websocket: WebSocket) -> None:
    """
    主要 WebSocket 連線處理函式。
    每個 WebSocket 連線可操作任意 session（透過 session_id 識別）。
    """
    await websocket.accept()
    logger.info("WebSocket client connected")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(
                    _error(None, None, "INVALID_JSON", "Message must be valid JSON")
                )
                continue

            event_type: str = msg.get("type", "")
            request_id: Optional[str] = msg.get("request_id")
            session_id: Optional[str] = msg.get("session_id")
            payload: Dict[str, Any] = msg.get("payload", {})

            # ── session.create ─────────────────────────────────────
            if event_type == "session.create":
                sid = session_manager.create_session()
                _screens[sid] = TerminalScreen()
                ptt = session_manager.get(sid)
                try:
                    await ptt.connect()
                except Exception as e:
                    await session_manager.close_session(sid)
                    del _screens[sid]
                    await websocket.send_text(
                        _error(request_id, None, "CONNECTION_FAILED", str(e))
                    )
                    continue
                await websocket.send_text(
                    _ok("session.created", request_id, sid, {"status": "ok"})
                )

            # ── session.close ──────────────────────────────────────
            elif event_type == "session.close":
                if not session_id or not session_manager.get(session_id):
                    await websocket.send_text(
                        _error(request_id, session_id, "SESSION_NOT_FOUND", "Session not found")
                    )
                    continue
                await session_manager.close_session(session_id)
                _screens.pop(session_id, None)
                await websocket.send_text(
                    _ok("session.closed", request_id, session_id, {"status": "ok"})
                )

            # ── auth.login ─────────────────────────────────────────
            elif event_type == "auth.login":
                ptt, screen, err = _get_session(session_id)
                if err:
                    await websocket.send_text(_error(request_id, session_id, *err))
                    continue
                username = payload.get("username", "")
                password = payload.get("password", "")
                try:
                    raw_data = await ptt.login(username, password)
                    screen.feed(raw_data)
                    logger.info("[auth.login] screen after login:\n%s", screen.get_snapshot())
                    await websocket.send_text(
                        _ok("auth.result", request_id, session_id, {
                            "success": True,
                            "message": "login success",
                        })
                    )
                except Exception as e:
                    await websocket.send_text(
                        _ok("auth.result", request_id, session_id, {
                            "success": False,
                            "message": str(e),
                        })
                    )

            # ── board.enter ────────────────────────────────────────
            elif event_type == "board.enter":
                ptt, screen, err = _get_session(session_id)
                if err:
                    await websocket.send_text(_error(request_id, session_id, *err))
                    continue
                board = payload.get("board", "")
                if not board:
                    await websocket.send_text(
                        _error(request_id, session_id, "MISSING_PARAM", "board is required")
                    )
                    continue
                try:
                    raw_data = await ptt.enter_board(board)
                    screen.feed(raw_data)
                    logger.info("[board.enter] screen after entering %s:\n%s", board, screen.get_snapshot())
                    await websocket.send_text(
                        _ok("navigation.state", request_id, session_id, {
                            "location": "board",
                            "board": board,
                            "article_id": None,
                        })
                    )
                except Exception as e:
                    await websocket.send_text(
                        _error(request_id, session_id, "BOARD_ENTER_FAILED", str(e))
                    )

            # ── board.fetch ────────────────────────────────────────
            elif event_type == "board.fetch":
                ptt, screen, err = _get_session(session_id)
                if err:
                    await websocket.send_text(_error(request_id, session_id, *err))
                    continue
                if ptt.location != "board":
                    await websocket.send_text(
                        _error(request_id, session_id, "INVALID_STATE",
                               "Must be in board view to fetch articles")
                    )
                    continue
                lines = screen.get_lines()
                logger.info("[board.fetch] screen lines:\n%s", "\n".join(f"  {i:02d}│{l}" for i, l in enumerate(lines)))
                board_data = _board_composer.compose(
                    lines,
                    board_name=ptt.current_board or "",
                )
                logger.info("[board.fetch] parsed %d articles", len(board_data.articles))
                await websocket.send_text(
                    _ok("board.state", request_id, session_id, board_data.to_dict())
                )

            # ── article.open ───────────────────────────────────────
            elif event_type == "article.open":
                ptt, screen, err = _get_session(session_id)
                if err:
                    await websocket.send_text(_error(request_id, session_id, *err))
                    continue
                article_ref = payload.get("article_ref")
                if article_ref is None:
                    await websocket.send_text(
                        _error(request_id, session_id, "MISSING_PARAM", "article_ref is required")
                    )
                    continue
                try:
                    index = int(article_ref)
                    raw_data = await ptt.go_to_article(index)
                    screen.feed(raw_data)
                    logger.info("[article.open] screen after opening article %d:\n%s", index, screen.get_snapshot())
                    ptt.current_article_id = str(index)
                    await websocket.send_text(
                        _ok("navigation.state", request_id, session_id, {
                            "location": "article",
                            "board": ptt.current_board,
                            "article_id": str(index),
                        })
                    )
                except Exception as e:
                    await websocket.send_text(
                        _error(request_id, session_id, "ARTICLE_OPEN_FAILED", str(e))
                    )

            # ── article.fetch ──────────────────────────────────────
            elif event_type == "article.fetch":
                ptt, screen, err = _get_session(session_id)
                if err:
                    await websocket.send_text(_error(request_id, session_id, *err))
                    continue
                if ptt.location != "article":
                    await websocket.send_text(
                        _error(request_id, session_id, "INVALID_STATE",
                               "Must be in article view to fetch article")
                    )
                    continue
                article_data = _article_composer.compose(
                    screen.get_lines(),
                    article_id=ptt.current_article_id,
                    board=ptt.current_board,
                )
                await websocket.send_text(
                    _ok("article.state", request_id, session_id, {
                        "board": ptt.current_board,
                        "article": article_data.to_dict(),
                    })
                )

            # ── article.next ───────────────────────────────────────
            elif event_type == "article.next":
                ptt, screen, err = _get_session(session_id)
                if err:
                    await websocket.send_text(_error(request_id, session_id, *err))
                    continue
                if ptt.location != "article":
                    await websocket.send_text(
                        _error(request_id, session_id, "INVALID_STATE", "Not in article view")
                    )
                    continue
                raw_data = await ptt.next_article()
                screen.feed(raw_data)
                await websocket.send_text(
                    _ok("navigation.state", request_id, session_id, {
                        "location": "article",
                        "board": ptt.current_board,
                        "article_id": ptt.current_article_id,
                    })
                )

            # ── article.prev ───────────────────────────────────────
            elif event_type == "article.prev":
                ptt, screen, err = _get_session(session_id)
                if err:
                    await websocket.send_text(_error(request_id, session_id, *err))
                    continue
                if ptt.location != "article":
                    await websocket.send_text(
                        _error(request_id, session_id, "INVALID_STATE", "Not in article view")
                    )
                    continue
                raw_data = await ptt.prev_article()
                screen.feed(raw_data)
                await websocket.send_text(
                    _ok("navigation.state", request_id, session_id, {
                        "location": "article",
                        "board": ptt.current_board,
                        "article_id": ptt.current_article_id,
                    })
                )

            # ── push.create ────────────────────────────────────────
            elif event_type == "push.create":
                ptt, screen, err = _get_session(session_id)
                if err:
                    await websocket.send_text(_error(request_id, session_id, *err))
                    continue
                if ptt.location != "article":
                    await websocket.send_text(
                        _error(request_id, session_id, "INVALID_STATE",
                               "cannot push when not in article view")
                    )
                    continue
                # push.create 尚未完整實作，回傳 not implemented
                await websocket.send_text(
                    _ok("push.result", request_id, session_id, {
                        "success": False,
                        "message": "push.create not implemented in MVP",
                    })
                )

            # ── navigation.back ────────────────────────────────────
            elif event_type == "navigation.back":
                ptt, screen, err = _get_session(session_id)
                if err:
                    await websocket.send_text(_error(request_id, session_id, *err))
                    continue
                raw_data = await ptt.go_back()
                screen.feed(raw_data)
                await websocket.send_text(
                    _ok("navigation.state", request_id, session_id, {
                        "location": ptt.location,
                        "board": ptt.current_board,
                        "article_id": None,
                    })
                )

            # ── screen.refresh ─────────────────────────────────────
            elif event_type == "screen.refresh":
                ptt, screen, err = _get_session(session_id)
                if err:
                    await websocket.send_text(_error(request_id, session_id, *err))
                    continue
                await websocket.send_text(
                    _ok("screen.state", request_id, session_id, {
                        "location": ptt.location,
                        "structured": True,
                        "snapshot": screen.get_snapshot(),
                    })
                )

            # ── unknown event ──────────────────────────────────────
            else:
                await websocket.send_text(
                    _error(request_id, session_id, "UNKNOWN_EVENT",
                           f"Unknown event type: {event_type}")
                )

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.exception(f"WebSocket error: {e}")


def _get_session(session_id: Optional[str]):
    """
    輔助函式：取得 PTTSession 與 TerminalScreen。
    回傳 (ptt, screen, None) 或 (None, None, (code, message))。
    """
    if not session_id:
        return None, None, ("MISSING_SESSION_ID", "session_id is required")
    ptt = session_manager.get(session_id)
    if not ptt:
        return None, None, ("SESSION_NOT_FOUND", f"Session {session_id} not found")
    screen = _screens.get(session_id)
    if not screen:
        return None, None, ("SESSION_NOT_FOUND", f"Screen for {session_id} not found")
    return ptt, screen, None
