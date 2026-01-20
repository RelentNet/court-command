from fastapi import FastAPI, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from contextlib import asynccontextmanager
import redis.asyncio as redis
from redis.exceptions import ConnectionError as RedisConnectionError
import json
import os
import asyncio
import logging

from database import init_db, get_session
from models import Match
from services.match_service import MatchService

# Logging Setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("API")

# Redis Setup
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown
    await redis_client.close()

app = FastAPI(title="RelentNet Pickleball API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency for Service
def get_match_service(session: AsyncSession = Depends(get_session)) -> MatchService:
    return MatchService(session, redis_client)

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.websocket("/ws/matches/{public_id}")
async def websocket_endpoint(websocket: WebSocket, public_id: str):
    await websocket.accept()
    pubsub = redis_client.pubsub()
    
    try:
        await pubsub.subscribe(f"match_updates_{public_id}")
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True)
            if message:
                await websocket.send_text(message["data"])
            await asyncio.sleep(0.01)
            
    except RedisConnectionError:
        logger.warning("Redis connection failed. Real-time updates disabled.")
        while True:
            await asyncio.sleep(10)
            
    except WebSocketDisconnect:
        pass
        
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        
    finally:
        if pubsub.connection:
            await pubsub.unsubscribe()
            await pubsub.aclose()

@app.post("/api/matches", response_model=Match)
async def create_match(match: Match, service: MatchService = Depends(get_match_service)):
    return await service.create_match(match)

@app.get("/api/matches/{public_id}", response_model=Match)
async def get_match(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.get_match(public_id)

@app.post("/api/matches/{public_id}/point")
async def add_point(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.add_point(public_id)

@app.post("/api/matches/{public_id}/sideout")
async def side_out(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.side_out(public_id)

@app.post("/api/matches/{public_id}/undo")
async def undo_last_event(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.undo_last_event(public_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)