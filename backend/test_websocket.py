#!/usr/bin/env python3
"""
PTT WebSocket 測試腳本

在 console 中執行完整測試流程。
用法:
  互動模式（在 terminal 直接執行）:
    python test_websocket.py

  參數模式（適合非互動式環境）:
    python test_websocket.py --user <帳號> --pass <密碼> [--board <看板>]

  除錯模式（印出實際畫面內容）:
    python test_websocket.py --user <帳號> --pass <密碼> --debug

範例:
    python test_websocket.py --user myaccount --pass mypassword --board Gossiping
    python test_websocket.py --user myaccount --pass mypassword --debug
"""

import argparse
import asyncio
import getpass
import json
import sys

try:
    import websockets
except ImportError:
    print("請先安裝 websockets 套件: pip install websockets")
    sys.exit(1)

WS_URL = "ws://localhost:8000/ws/ptt"

# 全域變數儲存最後一次回應
last_response = {}
# 除錯模式旗標
DEBUG_MODE = False


async def test_websocket(username: str, password: str, board_name: str):
    """測試 WebSocket 連線與 PTT 操作"""
    print("=" * 60)
    print("PTT WebSocket 測試腳本")
    print("=" * 60)
    print(f"帳號: {username}")
    print(f"測試看板: {board_name}")
    if DEBUG_MODE:
        print(f"模式: 🔍 DEBUG（顯示畫面快照）")
    print("-" * 60)

    try:
        async with websockets.connect(WS_URL) as ws:
            # 1. 建立 session
            print("\n[1/6] 建立 session...")
            await send_and_recv(ws, "session.create", None, {})
            session_id = last_response.get("session_id", "")
            if not session_id:
                print("  ❌ 錯誤: 無法建立 session")
                return
            print(f"  Session ID: {session_id}")

            # 2. 登入
            print("\n[2/6] 登入 PTT...")
            await send_and_recv(ws, "auth.login", session_id, {
                "username": username,
                "password": password,
            })
            print_login_result()
            if DEBUG_MODE:
                await dump_screen(ws, session_id, "登入後")

            # 3. 進入看板
            print(f"\n[3/6] 進入看板 {board_name}...")
            await send_and_recv(ws, "board.enter", session_id, {"board": board_name})
            print_navigation_result()
            if DEBUG_MODE:
                await dump_screen(ws, session_id, f"進入 {board_name} 後")

            # 4. 取得文章列表
            print("\n[4/6] 取得文章列表...")
            await send_and_recv(ws, "board.fetch", session_id, {})
            articles_count = print_board_result()
            if DEBUG_MODE and articles_count == 0:
                print("  ⚠️  無文章，印出實際畫面（debug）:")
                await dump_screen(ws, session_id, "board.fetch 失敗時")

            # 5. 開啟第一篇文章
            print("\n[5/6] 開啟第一篇文章...")
            await send_and_recv(ws, "article.open", session_id, {"article_ref": 1})
            print_navigation_result()
            if DEBUG_MODE:
                await dump_screen(ws, session_id, "進入文章後")

            # 6. 取得文章內容
            print("\n[6/6] 取得文章內容...")
            await send_and_recv(ws, "article.fetch", session_id, {})
            ok = print_article_result()
            if DEBUG_MODE and not ok:
                print("  ⚠️  文章內容解析失敗，印出實際畫面（debug）:")
                await dump_screen(ws, session_id, "article.fetch 失敗時")

            # 清理: 關閉 session
            print("\n清理: 關閉 session...")
            await send_and_recv(ws, "session.close", session_id, {})
            print("\n✅ 測試完成!")

    except ConnectionRefusedError:
        print("\n❌ 錯誤: 無法連接伺服器")
        print("   請確認伺服器已啟動: cd backend && python main.py")
    except websockets.exceptions.ConnectionClosed as e:
        print(f"\n❌ 錯誤: 連線被關閉 ({e})")
    except Exception as e:
        print(f"\n❌ 錯誤: {e}")
        raise


async def send_and_recv(ws, event_type: str, session_id, payload: dict):
    """傳送訊息並接收回應"""
    msg = {
        "type": event_type,
        "request_id": f"req_{event_type}",
    }
    if session_id:
        msg["session_id"] = session_id
    if payload:
        msg["payload"] = payload

    await ws.send(json.dumps(msg))
    raw = await ws.recv()
    global last_response
    last_response = json.loads(raw)

    resp_type = last_response.get("type", "unknown")
    if resp_type == "error":
        err = last_response.get("payload", {})
        print(f"  ❌ 錯誤: {err.get('code')} - {err.get('message')}")
    else:
        print(f"  ✅ 收到: {resp_type}")


async def dump_screen(ws, session_id: str, label: str = ""):
    """送出 screen.refresh 並印出畫面快照（用於除錯）"""
    msg = {
        "type": "screen.refresh",
        "request_id": "req_debug_screen",
        "session_id": session_id,
    }
    await ws.send(json.dumps(msg))
    raw = await ws.recv()
    resp = json.loads(raw)
    snapshot = resp.get("payload", {}).get("snapshot", "")
    tag = f" [{label}]" if label else ""
    print(f"\n  ┌── 畫面快照{tag} {'─' * (50 - len(label))}┐")
    for line in snapshot.split("\n"):
        print(f"  │ {line}")
    print(f"  └{'─' * 54}┘\n")


def print_login_result():
    payload = last_response.get("payload", {})
    if payload.get("success"):
        print("  ✅ 登入成功")
    else:
        print(f"  ❌ 登入失敗: {payload.get('message')}")


def print_navigation_result():
    payload = last_response.get("payload", {})
    loc = payload.get("location", "unknown")
    board = payload.get("board", "")
    print(f"  📍 位置: {loc}, 看板: {board}")


def print_board_result() -> int:
    """印出看板文章列表，回傳文章數量"""
    payload = last_response.get("payload", {})
    articles = payload.get("articles", [])
    total = payload.get("total", len(articles))
    print(f"  📋 文章總數: {total}")
    if articles:
        print(f"  📄 最新文章列表（最多顯示 5 篇）:")
        for a in articles[:5]:
            idx = a.get("id", "?")
            title = a.get("title", "N/A")
            author = a.get("author", "N/A")
            date = a.get("date", "")
            pop = a.get("popularity", "")
            print(f"       [{idx}] {pop:3s} {date} {author:12s} {title}")
    else:
        print("  📄 (沒有取得文章列表)")
    return len(articles)


def print_article_result() -> bool:
    """印出文章內容，回傳是否成功解析（title/author 不為 None）"""
    payload = last_response.get("payload", {})
    article = payload.get("article", {})
    title = article.get("title")
    author = article.get("author")
    time_ = article.get("time")
    content = article.get("content", "")
    pushes = article.get("pushes", [])

    print(f"  📖 標題: {title or '(未解析)'}")
    print(f"  ✍️  作者: {author or '(未解析)'}")
    if time_:
        print(f"  🕐 時間: {time_}")
    if content:
        preview = content[:100].replace("\n", " ")
        print(f"  📝 內文預覽: {preview}{'...' if len(content) > 100 else ''}")
    if pushes:
        print(f"  💬 推文數: {len(pushes)}")

    return title is not None and author is not None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PTT WebSocket 測試腳本")
    parser.add_argument("--user", "-u", help="PTT 帳號")
    parser.add_argument("--pass", "-p", dest="password", help="PTT 密碼")
    parser.add_argument("--board", "-b", default="Gossiping", help="測試看板 (預設: Gossiping)")
    parser.add_argument("--debug", "-d", action="store_true", help="除錯模式：顯示實際畫面快照")
    args = parser.parse_args()

    # 設定全域除錯旗標
    DEBUG_MODE = args.debug

    # 若沒有透過參數提供，改為互動式輸入
    username = args.user or input("請輸入 PTT 帳號: ").strip()
    password = args.password or getpass.getpass("請輸入 PTT 密碼: ")
    board_name = args.board

    if not username or not password:
        print("錯誤: 帳號和密碼不能為空")
        sys.exit(1)

    asyncio.run(test_websocket(username, password, board_name))
