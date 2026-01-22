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
from models import Match, Court, Player, Team
from services.match_service import MatchService
from services.court_service import CourtService
from services.registry_service import RegistryService
from typing import List, Optional
from pydantic import BaseModel

# Logging Setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("API")

# Redis Setup
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    # Initialize Redis in app state
    app.state.redis = redis.from_url(REDIS_URL, decode_responses=True)
    yield
    # Shutdown
    await app.state.redis.close()

app = FastAPI(title="CourtCommand Pickleball API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency for Redis
def get_redis(request: Request):
    return request.app.state.redis

# Dependency for Match Service
def get_match_service(
    session: AsyncSession = Depends(get_session),
    redis_client = Depends(get_redis)
) -> MatchService:
    return MatchService(session, redis_client)

# Dependency for Court Service
def get_court_service(session: AsyncSession = Depends(get_session)) -> CourtService:
    return CourtService(session)

# Dependency for Registry Service
def get_registry_service(session: AsyncSession = Depends(get_session)) -> RegistryService:
    return RegistryService(session)

@app.get("/health")
def health_check():
    return {"status": "healthy"}

# --- Registry Endpoints ---

@app.get("/players", response_model=List[Player])
async def get_players(service: RegistryService = Depends(get_registry_service)):
    return await service.get_all_players()

@app.post("/players", response_model=Player)
async def create_player(player: Player, service: RegistryService = Depends(get_registry_service)):
    return await service.create_player(player)

@app.get("/teams", response_model=List[Team])
async def get_teams(service: RegistryService = Depends(get_registry_service)):
    return await service.get_all_teams()

@app.post("/teams", response_model=Team)
async def create_team(team: Team, service: RegistryService = Depends(get_registry_service)):
    return await service.create_team(team)

@app.get("/teams/{team_id}", response_model=Team)
async def get_team(team_id: int, service: RegistryService = Depends(get_registry_service)):
    return await service.get_team(team_id)

# --- Courts Endpoints ---

class CreateCourtRequest(BaseModel):
    name: str

from datetime import datetime

class CourtSummary(BaseModel):
    id: int
    name: str
    slug: str
    created_at: datetime
    is_active: bool = False

class CourtWithMatch(BaseModel):
    id: int
    name: str
    slug: str
    created_at: datetime
    active_match: Optional[Match] = None
    match_history: List[Match] = []

@app.get("/courts", response_model=List[CourtSummary])
async def get_courts(service: CourtService = Depends(get_court_service)):
    return await service.get_all_courts()

@app.post("/courts", response_model=Court)
async def create_court(payload: CreateCourtRequest, service: CourtService = Depends(get_court_service)):
    return await service.create_court(payload.name)

@app.get("/courts/{slug}", response_model=CourtWithMatch)
async def get_court(slug: str, service: CourtService = Depends(get_court_service)):
    return await service.get_court_by_slug(slug)

@app.delete("/courts/{slug}")
async def delete_court(slug: str, service: CourtService = Depends(get_court_service)):
    await service.delete_court(slug)
    return {"status": "deleted"}

# --- Match Endpoints ---

@app.websocket("/ws/matches/{public_id}")
async def websocket_endpoint(websocket: WebSocket, public_id: str):
    await websocket.accept()
    
    # Access redis from app state (websocket has access to app)
    redis_client = websocket.app.state.redis
    pubsub = redis_client.pubsub()
    
    try:
        await pubsub.subscribe(f"match_updates_{public_id}")
        
        # Async iterator is more efficient than polling
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
            
    except RedisConnectionError:
        logger.error(f"Redis connection failed for match {public_id}")
        # Close with status code indicating internal error to trigger client reconnect
        await websocket.close(code=1011, reason="Redis Connection Failed")
            
    except WebSocketDisconnect:
        # Normal client disconnect
        logger.info(f"Client disconnected from match {public_id}")
        
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=1011)
        except:
            pass
        
    finally:
        # Cleanup resources
        try:
            await pubsub.unsubscribe()
            await pubsub.close()
        except:
            pass

@app.post("/matches", response_model=Match)
async def create_match(match: Match, service: MatchService = Depends(get_match_service)):
    return await service.create_match(match)

@app.get("/matches/{public_id}", response_model=Match)
async def get_match(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.get_match(public_id)

@app.post("/matches/{public_id}/point")
async def add_point(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.add_point(public_id)

@app.post("/matches/{public_id}/sideout")
async def side_out(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.side_out(public_id)

@app.post("/matches/{public_id}/undo", response_model=Match)
async def undo_last_event(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.undo_last_event(public_id)

@app.post("/matches/{public_id}/reset", response_model=Match)
async def reset_match(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.reset_match(public_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
