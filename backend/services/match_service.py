from sqlmodel import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from fastapi import HTTPException
import json
import logging
from redis.asyncio import Redis

from models import Match, MatchEvent
from logic.pickleball import PickleballEngine

logger = logging.getLogger("MatchService")

class MatchService:
    def __init__(self, session: AsyncSession, redis_client: Redis):
        self.session = session
        self.redis = redis_client

    async def _get_match_with_lock(self, public_id: str) -> Match:
        """Fetches a match by public_id with a database lock for update."""
        statement = select(Match).where(Match.public_id == public_id).with_for_update()
        result = await self.session.execute(statement)
        match = result.scalar_one_or_none()
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")
        return match

    async def _get_next_sequence_id(self, match_id: int) -> int:
        statement = select(func.count()).select_from(MatchEvent).where(MatchEvent.match_id == match_id)
        result = await self.session.execute(statement)
        count = result.scalar_one()
        return count + 1

    async def _broadcast_update(self, match: Match):
        try:
            data = match.model_dump(mode="json")
            await self.redis.publish(f"match_updates_{match.public_id}", json.dumps(data))
        except Exception as e:
            logger.error(f"Redis publish failed: {e}")

    async def _commit_and_broadcast(self, match: Match, event: MatchEvent):
        self.session.add(event)
        self.session.add(match)
        await self.session.commit()
        await self.session.refresh(match)
        await self._broadcast_update(match)

    async def get_match(self, public_id: str) -> Match:
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

        if match.status == "final":
            raise HTTPException(status_code=400, detail="Match is already finalized")

        if match.status == "preparing":
            match.status = "in_progress"

        payload = PickleballEngine.process_point(match)
        
        seq_id = await self._get_next_sequence_id(match.id)
        event = MatchEvent(
            match_id=match.id,
            sequence_id=seq_id,
            event_type="POINT_SCORED",
            score_snapshot=match.model_dump(mode="json"),
            payload=payload
        )
        
        await self._commit_and_broadcast(match, event)
        return match

    async def side_out(self, public_id: str) -> Match:
        match = await self._get_match_with_lock(public_id)

        if match.status == "final":
            raise HTTPException(status_code=400, detail="Match is already finalized")

        payload = PickleballEngine.process_side_out(match)

        seq_id = await self._get_next_sequence_id(match.id)
        event = MatchEvent(
            match_id=match.id,
            sequence_id=seq_id,
            event_type="SIDE_OUT",
            score_snapshot=match.model_dump(mode="json"),
            payload=payload
        )
        
        await self._commit_and_broadcast(match, event)
        return match

    async def end_game(self, public_id: str) -> Match:
        match = await self._get_match_with_lock(public_id)

        if match.status == "final":
            raise HTTPException(status_code=400, detail="Match is already finalized")

        payload = PickleballEngine.process_end_game(match)
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(match, "completed_games")
        
        seq_id = await self._get_next_sequence_id(match.id)
        event = MatchEvent(
            match_id=match.id,
            sequence_id=seq_id,
            event_type="GAME_COMPLETE",
            score_snapshot=match.model_dump(mode="json"),
            payload=payload
        )
        
        await self._commit_and_broadcast(match, event)
        return match

    async def end_match(self, public_id: str) -> Match:
        match = await self._get_match_with_lock(public_id)

        payload = PickleballEngine.process_end_match(match)
        
        seq_id = await self._get_next_sequence_id(match.id)
        event = MatchEvent(
            match_id=match.id,
            sequence_id=seq_id,
            event_type="MATCH_COMPLETE",
            score_snapshot=match.model_dump(mode="json"),
            payload=payload
        )
        
        await self._commit_and_broadcast(match, event)
        return match

    def _restore_snapshot(self, match: Match, snapshot: dict):
        match.team_1_score = snapshot.get("team_1_score", 0)
        match.team_2_score = snapshot.get("team_2_score", 0)
        match.server_number = snapshot.get("server_number", 1)
        match.serving_team = snapshot.get("serving_team", 1)
        match.status = snapshot.get("status", "in_progress")
        match.current_game_num = snapshot.get("current_game_num", 1)
        match.completed_games = snapshot.get("completed_games", [])
        
        if "participants" in snapshot:
            match.participants = snapshot["participants"]
        if "config" in snapshot:
            match.config = snapshot["config"]
        match.team_1_id = snapshot.get("team_1_id")
        match.team_2_id = snapshot.get("team_2_id")
        match.first_serving_team = snapshot.get("first_serving_team")
        
        # Flag modified for JSON fields to be safe
        flag_modified(match, "completed_games")
        flag_modified(match, "participants")
        flag_modified(match, "config")

    async def undo_last_event(self, public_id: str) -> Match:
        match = await self._get_match_with_lock(public_id)

        # Get last event
        stmt_last = select(MatchEvent).where(MatchEvent.match_id == match.id).order_by(MatchEvent.sequence_id.desc()).limit(1)
        result_last = await self.session.execute(stmt_last)
        last_event = result_last.scalar_one_or_none()
        
        if not last_event:
            return match

        # Get the event before the last one
        stmt_prev = select(MatchEvent).where(MatchEvent.match_id == match.id).where(MatchEvent.sequence_id < last_event.sequence_id).order_by(MatchEvent.sequence_id.desc()).limit(1)
        result_prev = await self.session.execute(stmt_prev)
        prev_event = result_prev.scalar_one_or_none()

        if prev_event:
            self._restore_snapshot(match, prev_event.score_snapshot)
        else:
            # Reset to zero (Pre-match state)
            match.team_1_score = 0
            match.team_2_score = 0
            match.server_number = 1
            match.serving_team = 1
            match.status = "preparing"
            match.current_game_num = 1
            match.completed_games = []
            flag_modified(match, "completed_games")

        delete_stmt = delete(MatchEvent).where(MatchEvent.id == last_event.id)
        await self.session.execute(delete_stmt)
        
        self.session.add(match)
        await self.session.commit()
        await self.session.refresh(match)
        await self._broadcast_update(match)
        return match

    async def reset_match(self, public_id: str) -> Match:
        match = await self._get_match_with_lock(public_id)

        match.team_1_score = 0
        match.team_2_score = 0
        match.current_game_num = 1
        match.server_number = 1
        match.serving_team = 1
        match.status = "preparing"
        match.completed_games = []
        flag_modified(match, "completed_games")

        seq_id = await self._get_next_sequence_id(match.id)
        event = MatchEvent(
            match_id=match.id,
            sequence_id=seq_id,
            event_type="MATCH_RESET",
            score_snapshot=match.model_dump(mode="json"),
            payload={"action": "reset"}
        )
        
        await self._commit_and_broadcast(match, event)
        return match

    async def swap_teams(self, public_id: str) -> Match:
        match = await self._get_match_with_lock(public_id)

        match.team_1_id, match.team_2_id = match.team_2_id, match.team_1_id
        match.team_1_score, match.team_2_score = match.team_2_score, match.team_1_score
        
        p1 = match.participants.get("team_1")
        p2 = match.participants.get("team_2")
        match.participants = {
            **match.participants,
            "team_1": p2,
            "team_2": p1
        }
        flag_modified(match, "participants")
        
        new_completed_games = []
        for g in match.completed_games:
            new_g = g.copy()
            new_g["score_team_1"] = g["score_team_2"]
            new_g["score_team_2"] = g["score_team_1"]
            if g.get("winner") == 1:
                new_g["winner"] = 2
            elif g.get("winner") == 2:
                new_g["winner"] = 1
            new_completed_games.append(new_g)
        match.completed_games = new_completed_games
        flag_modified(match, "completed_games")
        
        if match.first_serving_team == 1:
            match.first_serving_team = 2
        elif match.first_serving_team == 2:
            match.first_serving_team = 1

        if match.serving_team == 1:
            match.serving_team = 2
        else:
            match.serving_team = 1
            
        seq_id = await self._get_next_sequence_id(match.id)
        event = MatchEvent(
            match_id=match.id,
            sequence_id=seq_id,
            event_type="TEAMS_SWAPPED",
            score_snapshot=match.model_dump(mode="json"),
            payload={"action": "swap_teams"}
        )
        
        await self._commit_and_broadcast(match, event)
        return match

    async def rematch(self, public_id: str) -> Match:
        old_match = await self._get_match_with_lock(public_id)
        
        if old_match.status != "final":
            old_match.status = "final"
            self.session.add(old_match)
        
        import uuid
        from datetime import datetime
        
        new_match = Match(
            public_id=str(uuid.uuid4()),
            court_slug=old_match.court_slug,
            status="preparing",
            team_1_id=old_match.team_1_id,
            team_2_id=old_match.team_2_id,
            first_serving_team=old_match.first_serving_team,
            participants=old_match.participants,
            config=old_match.config,
            created_at=datetime.utcnow()
        )
        
        new_match.team_1_score = 0
        new_match.team_2_score = 0
        new_match.current_game_num = 1
        new_match.server_number = 1
        new_match.serving_team = new_match.first_serving_team or 1
        new_match.completed_games = []
        
        self.session.add(new_match)
        await self.session.commit()
        await self.session.refresh(new_match)
        return new_match

    async def delete_match(self, public_id: str):
        match = await self._get_match_with_lock(public_id)
        
        stmt_events = delete(MatchEvent).where(MatchEvent.match_id == match.id)
        await self.session.execute(stmt_events)
        
        await self.session.delete(match)
        await self.session.commit()

    async def configure_match(self, public_id: str, config_data: dict) -> Match:
        match = await self._get_match_with_lock(public_id)

        if "team_1_id" in config_data:
            match.team_1_id = config_data["team_1_id"]
        if "team_2_id" in config_data:
            match.team_2_id = config_data["team_2_id"]
        if "status" in config_data:
            match.status = config_data["status"]
        if "config" in config_data:
            match.config = config_data["config"]
            flag_modified(match, "config")
        if "first_serving_team" in config_data:
            match.first_serving_team = config_data["first_serving_team"]
            if match.team_1_score == 0 and match.team_2_score == 0:
                match.serving_team = match.first_serving_team
        if "participants" in config_data:
            match.participants = config_data["participants"]
            flag_modified(match, "participants")

        seq_id = await self._get_next_sequence_id(match.id)
        event = MatchEvent(
            match_id=match.id,
            sequence_id=seq_id,
            event_type="MATCH_CONFIGURED",
            score_snapshot=match.model_dump(mode="json"),
            payload={"action": "configure", "data": config_data}
        )
        
        await self._commit_and_broadcast(match, event)
        return match