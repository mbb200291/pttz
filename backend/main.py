"""
PTT Backend – Entry Point

啟動 FastAPI + WebSocket 伺服器。
WebSocket endpoint: ws://localhost:8000/ws/ptt
"""

import logging
import sys
import os
from contextlib import asynccontextmanager

# 確保 backend/ 目錄在 Python path 內（方便各模組互相 import）
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from api.websocket_handler import handle_websocket
from api.session_manager import session_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan event handlers"""
    yield  # Startup
    logger.info("Shutting down – closing all PTT sessions")
    await session_manager.close_all()


app = FastAPI(title="PTT WebSocket API", version="1.0.0", lifespan=lifespan)

# CORS：允許本地前端開發
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def health_check():
    return {"status": "ok", "service": "PTT WebSocket API v1"}


@app.websocket("/ws/ptt")
async def websocket_endpoint(websocket: WebSocket):
    """
    主要 WebSocket endpoint。
    遵循 PTT WebSocket API Spec v1。
    """
    await handle_websocket(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
