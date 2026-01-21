from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
import json
import logging
from redis.asyncio import Redis

from models import Match, MatchEvent

logger = logging.getLogger("MatchService")

class MatchService:
    def __init__(self, session: AsyncSession, redis_client: Redis):
        self.session = session
        self.redis = redis_client

    async def _get_match_with_lock(self, public_id: str) -> Match:
        """Fetches a match by public_id with a database lock for update."""
        # 'with_for_update' locks the row until the transaction is committed
        statement = select(Match).where(Match.public_id == public_id).with_for_update()
        result = await self.session.execute(statement)
        match = result.scalar_one_or_none()
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")
        return match

    async def _get_next_sequence_id(self, match_id: int) -> int:
        """Calculates the next sequence ID for the event log."""
        statement = select(func.count()).select_from(MatchEvent).where(MatchEvent.match_id == match_id)
        result = await self.session.execute(statement)
        count = result.scalar_one()
        return count + 1

    async def _broadcast_update(self, match: Match):
        """Publishes the current match state to Redis."""
        try:
            data = match.model_dump(mode="json")
            await self.redis.publish(f"match_updates_{match.public_id}", json.dumps(data))
        except Exception as e:
            logger.error(f"Redis publish failed: {e}")

    async def get_match(self, public_id: str) -> Match:
        """ReadOnly fetch of a match."""
        statement = select(Match).where(Match.public_id == public_id)
        result = await self.session.execute(statement)
        match = result.scalar_one_or_none()
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")
        return match

    async def create_match(self, match_data: Match) -> Match:
        self.session.add(match_data)
        await self.session.commit()
        await self.session.refresh(match_data)
        return match_data

    async def add_point(self, public_id: str) -> Match:
        match = await self._get_match_with_lock(public_id)

        # Logic: Add Point
        if match.serving_team == 1:
            match.team_1_score += 1
        else:
            match.team_2_score += 1
            
        # Check for Game Over
        points_to = match.config.get("points_to", 11)
        win_by = match.config.get("win_by", 2)
        
        t1 = match.team_1_score
        t2 = match.team_2_score
        
        game_won = False
        winner = None
        
        if t1 >= points_to and (t1 - t2) >= win_by:
            game_won = True
            winner = 1
        elif t2 >= points_to and (t2 - t1) >= win_by:
            game_won = True
            winner = 2
            
        if game_won:
            # Archive Result
            match.completed_games.append({
                "game_num": match.current_game_num,
                "score_team_1": t1,
                "score_team_2": t2,
                "winner": winner
            })
            # IMPORTANT: SqlAlchemy sometimes doesn't detect JSON mutation in place
            # Re-assigning triggers the flag_modified
            match.completed_games = list(match.completed_games)
            
            # Reset for next game
            match.team_1_score = 0
            match.team_2_score = 0
            match.current_game_num += 1
            match.server_number = 1
            match.serving_team = 1 # Or logic for who serves first in next game
        
        # Log Event
        seq_id = await self._get_next_sequence_id(match.id)

        event = MatchEvent(
            match_id=match.id,
            sequence_id=seq_id,
            event_type="POINT_SCORED",
            score_snapshot=match.model_dump(mode="json"),
            payload={"action": "point", "team": match.serving_team}
        )
        self.session.add(event)
        self.session.add(match)
        
        await self.session.commit()
        await self.session.refresh(match)
        await self._broadcast_update(match)
        return match

    async def side_out(self, public_id: str) -> Match:
        match = await self._get_match_with_lock(public_id)

        old_server = match.server_number
        old_serving_team = match.serving_team

        # Logic: Side Out / Server Switch
        if match.server_number == 1:
            match.server_number = 2
        else:
            match.server_number = 1
            match.serving_team = 2 if match.serving_team == 1 else 1

        # Log Event
        seq_id = await self._get_next_sequence_id(match.id)
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
        self.session.add(event)
        self.session.add(match)
        
        await self.session.commit()
        await self.session.refresh(match)
        await self._broadcast_update(match)
        return match

    async def undo_last_event(self, public_id: str) -> Match:
        # Note: We lock here too to prevent new events while undoing
        match = await self._get_match_with_lock(public_id)

        # Get last event
        stmt_last = select(MatchEvent).where(MatchEvent.match_id == match.id).order_by(MatchEvent.sequence_id.desc()).limit(1)
        result_last = await self.session.execute(stmt_last)
        last_event = result_last.scalar_one_or_none()
        
        if not last_event:
            return match # Nothing to undo

        # Get the event before the last one
        stmt_prev = select(MatchEvent).where(MatchEvent.match_id == match.id).where(MatchEvent.sequence_id < last_event.sequence_id).order_by(MatchEvent.sequence_id.desc()).limit(1)
        result_prev = await self.session.execute(stmt_prev)
        prev_event = result_prev.scalar_one_or_none()

        if prev_event:
            # Restore
            snapshot = prev_event.score_snapshot
            match.team_1_score = snapshot.get("team_1_score", 0)
            match.team_2_score = snapshot.get("team_2_score", 0)
            match.server_number = snapshot.get("server_number", 1)
            match.serving_team = snapshot.get("serving_team", 1)
        else:
            # Reset to zero
            match.team_1_score = 0
            match.team_2_score = 0
            match.server_number = 1
            match.serving_team = 1

        await self.session.delete(last_event)
        self.session.add(match)
        
        await self.session.commit()
        await self.session.refresh(match)
        await self._broadcast_update(match)
        return match
