from fastapi import FastAPI, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from contextlib import asynccontextmanager
import redis.asyncio as redis
import json
import os
import asyncio

from database import init_db, get_session
from models import Match, MatchEvent

# Redis Setup
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await redis_client.close()

app = FastAPI(title="RelentNet Pickleball API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

async def broadcast_match_update(match: Match):
    """Publishes the current match state to Redis."""
    try:
        data = match.model_dump(mode="json")
        await redis_client.publish(f"match_updates_{match.public_id}", json.dumps(data))
    except Exception as e:
        print(f"Warning: Redis publish failed (Redis might be down): {e}")

async def get_next_sequence_id(session: AsyncSession, match_id: int) -> int:
    """Calculates the next sequence ID for the event log."""
    statement = select(func.count()).select_from(MatchEvent).where(MatchEvent.match_id == match_id)
    result = await session.execute(statement)
    count = result.scalar_one()
    return count + 1

# --- Endpoints ---

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
            await asyncio.sleep(0.01) # Prevent tight loop
    except redis.exceptions.ConnectionError:
        print("Warning: Redis connection failed. Real-time updates disabled.")
        # Keep socket open so frontend doesn't panic-reconnect loop
        while True:
            await asyncio.sleep(10)
    except WebSocketDisconnect:
        if pubsub.connection:
            await pubsub.unsubscribe()
    except Exception as e:
        print(f"WebSocket error: {e}")
        if pubsub.connection:
            await pubsub.unsubscribe()

@app.post("/api/matches", response_model=Match)
async def create_match(match: Match, session: AsyncSession = Depends(get_session)):
    session.add(match)
    await session.commit()
    await session.refresh(match)
    return match

@app.get("/api/matches/{public_id}", response_model=Match)
async def get_match(public_id: str, session: AsyncSession = Depends(get_session)):
    statement = select(Match).where(Match.public_id == public_id)
    result = await session.execute(statement)
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match

@app.post("/api/matches/{public_id}/point")
async def add_point(public_id: str, session: AsyncSession = Depends(get_session)):
    statement = select(Match).where(Match.public_id == public_id)
    result = await session.execute(statement)
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Logic: Add Point to Serving Team
    if match.serving_team == 1:
        match.team_1_score += 1
    else:
        match.team_2_score += 1
    
    # Log Event
    seq_id = await get_next_sequence_id(session, match.id)
    event = MatchEvent(
        match_id=match.id,
        sequence_id=seq_id,
        event_type="POINT_SCORED",
        score_snapshot=match.model_dump(mode="json"),
        payload={"action": "point", "team": match.serving_team}
    )
    session.add(event)
    
    await session.commit()
    await session.refresh(match)
    await broadcast_match_update(match)
    return match

@app.post("/api/matches/{public_id}/sideout")
async def side_out(public_id: str, session: AsyncSession = Depends(get_session)):
    statement = select(Match).where(Match.public_id == public_id)
    result = await session.execute(statement)
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Pickleball Logic: 
    # If Server 1 -> Server 2.
    # If Server 2 -> Side Out (Switch Team, Server 1).
    
    old_server = match.server_number
    old_serving_team = match.serving_team

    if match.server_number == 1:
        match.server_number = 2
    else:
        match.server_number = 1
        match.serving_team = 2 if match.serving_team == 1 else 1

    # Log Event
    seq_id = await get_next_sequence_id(session, match.id)
    event = MatchEvent(
        match_id=match.id,
        sequence_id=seq_id,
        event_type="SIDE_OUT",
        score_snapshot=match.model_dump(mode="json"),
        payload={
            "prev_server": old_server,
            "prev_team": old_serving_team,
            "new_server": match.server_number,
            "new_team": match.serving_team
        }
    )
    session.add(event)

    await session.commit()
    await session.refresh(match)
    await broadcast_match_update(match)
    return match

@app.post("/api/matches/{public_id}/undo")
async def undo_last_event(public_id: str, session: AsyncSession = Depends(get_session)):
    # This is a complex operation:
    # 1. Find the Match
    # 2. Find the LAST event for this match.
    # 3. Find the event BEFORE that (to restore state).
    # 4. If no previous event, restore to 0-0-0 initial state.
    
    statement = select(Match).where(Match.public_id == public_id)
    result = await session.execute(statement)
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Get last event
    stmt_last = select(MatchEvent).where(MatchEvent.match_id == match.id).order_by(MatchEvent.sequence_id.desc()).limit(1)
    result_last = await session.execute(stmt_last)
    last_event = result_last.scalar_one_or_none()
    
    if not last_event:
        return match # Nothing to undo

    # Get the event before the last one to restore state
    stmt_prev = select(MatchEvent).where(MatchEvent.match_id == match.id).where(MatchEvent.sequence_id < last_event.sequence_id).order_by(MatchEvent.sequence_id.desc()).limit(1)
    result_prev = await session.execute(stmt_prev)
    prev_event = result_prev.scalar_one_or_none()

    if prev_event:
        # Restore from snapshot
        snapshot = prev_event.score_snapshot
        match.team_1_score = snapshot.get("team_1_score", 0)
        match.team_2_score = snapshot.get("team_2_score", 0)
        match.server_number = snapshot.get("server_number", 1)
        match.serving_team = snapshot.get("serving_team", 1)
        # ... restore other fields as needed
    else:
        # No previous event means we are back to start
        match.team_1_score = 0
        match.team_2_score = 0
        match.server_number = 1
        match.serving_team = 1
        # TODO: Check 'start_on_server_2' config if we want to support that restoration accurately

    # Delete the undone event (or mark as undone if we want a redo history)
    await session.delete(last_event)
    
    await session.commit()
    await session.refresh(match)
    await broadcast_match_update(match)
    return match

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
