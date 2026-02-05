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
from models import Match, Court, Player, Team, MatchPreset
from schemas import CreateCourtRequest, CourtSummary, CourtWithMatch, ConfigureMatchRequest
from services.match_service import MatchService
from services.court_service import CourtService
from services.registry_service import RegistryService
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import Body

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

from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
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
def get_court_service(
    session: AsyncSession = Depends(get_session),
    redis_client = Depends(get_redis)
) -> CourtService:
    return CourtService(session, redis_client)

# Dependency for Registry Service
def get_registry_service(session: AsyncSession = Depends(get_session)) -> RegistryService:
    return RegistryService(session)

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/migrate")
async def run_migrations():
    from migrate import migrate as run_migrate
    try:
        await run_migrate()
        return {"status": "success", "message": "Migrations completed"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- WebSocket Helper ---

async def handle_websocket_subscription(websocket: WebSocket, channel_name: str):
    await websocket.accept()
    redis_client = websocket.app.state.redis
    pubsub = redis_client.pubsub()
    try:
        await pubsub.subscribe(channel_name)
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except RedisConnectionError:
         logger.error(f"Redis connection failed for {channel_name}")
         await websocket.close(code=1011, reason="Redis Connection Failed")
    except WebSocketDisconnect:
        logger.info(f"Client disconnected from {channel_name}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
             await websocket.close(code=1011)
        except:
             pass
    finally:
        try:
            await pubsub.unsubscribe()
            await pubsub.close()
        except:
            pass

# --- Registry Endpoints ---

@app.get("/presets", response_model=List[MatchPreset])
async def get_presets(service: RegistryService = Depends(get_registry_service)):
    return await service.get_all_presets()

@app.post("/presets", response_model=MatchPreset)
async def create_preset(preset: MatchPreset, service: RegistryService = Depends(get_registry_service)):
    return await service.create_preset(preset)

@app.delete("/presets/{preset_id}")
async def delete_preset(preset_id: int, service: RegistryService = Depends(get_registry_service)):
    await service.delete_preset(preset_id)
    return {"status": "deleted"}

@app.get("/players", response_model=List[Player])
async def get_players(service: RegistryService = Depends(get_registry_service)):
    return await service.get_all_players()

@app.post("/players", response_model=Player)
async def create_player(player: Player, service: RegistryService = Depends(get_registry_service)):
    return await service.create_player(player)

@app.put("/players/{player_id}", response_model=Player)
async def update_player(player_id: int, player: Player, service: RegistryService = Depends(get_registry_service)):
    return await service.update_player(player_id, player)

@app.delete("/players/{player_id}")
async def delete_player(player_id: int, service: RegistryService = Depends(get_registry_service)):
    await service.delete_player(player_id)
    return {"status": "deleted"}

@app.get("/teams", response_model=List[Team])
async def get_teams(service: RegistryService = Depends(get_registry_service)):
    return await service.get_all_teams()

@app.post("/teams", response_model=Team)
async def create_team(team: Team, service: RegistryService = Depends(get_registry_service)):
    return await service.create_team(team)

@app.put("/teams/{team_id}", response_model=Team)
async def update_team(team_id: int, team: Team, service: RegistryService = Depends(get_registry_service)):
    return await service.update_team(team_id, team)

@app.delete("/teams/{team_id}")
async def delete_team(team_id: int, service: RegistryService = Depends(get_registry_service)):
    await service.delete_team(team_id)
    return {"status": "deleted"}

@app.get("/teams/{team_id}", response_model=Team)
async def get_team(team_id: int, service: RegistryService = Depends(get_registry_service)):
    return await service.get_team(team_id)

# --- Courts Endpoints ---

@app.websocket("/ws/courts/{slug}")
async def websocket_court_endpoint(websocket: WebSocket, slug: str):
    await handle_websocket_subscription(websocket, f"court_updates_{slug}")

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

@app.patch("/courts/{slug}", response_model=Court)
async def update_court(
    slug: str, 
    payload: Dict[str, Any], 
    service: CourtService = Depends(get_court_service)
):
    return await service.update_court(slug, payload)

# --- Match Endpoints ---

@app.websocket("/ws/matches/{public_id}")
async def websocket_endpoint(websocket: WebSocket, public_id: str):
    await handle_websocket_subscription(websocket, f"match_updates_{public_id}")

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

@app.post("/matches/{public_id}/end-game", response_model=Match)
async def end_game(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.end_game(public_id)

@app.post("/matches/{public_id}/end-match", response_model=Match)
async def end_match(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.end_match(public_id)

@app.post("/matches/{public_id}/undo", response_model=Match)
async def undo_last_event(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.undo_last_event(public_id)

@app.post("/matches/{public_id}/reset", response_model=Match)
async def reset_match(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.reset_match(public_id)

@app.post("/matches/{public_id}/swap-teams", response_model=Match)
async def swap_teams(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.swap_teams(public_id)

@app.post("/matches/{public_id}/rematch", response_model=Match)
async def rematch(public_id: str, service: MatchService = Depends(get_match_service)):
    return await service.rematch(public_id)

@app.delete("/matches/{public_id}")
async def delete_match(public_id: str, service: MatchService = Depends(get_match_service)):
    await service.delete_match(public_id)
    return {"status": "deleted"}

@app.patch("/matches/{public_id}/configure", response_model=Match)
async def configure_match(
    public_id: str, 
    payload: ConfigureMatchRequest, 
    service: MatchService = Depends(get_match_service)
):
    return await service.configure_match(public_id, payload.model_dump(exclude_unset=True))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)