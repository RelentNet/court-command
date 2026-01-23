from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
import re
import json
import logging
from redis.asyncio import Redis
from typing import List, Dict, Any, Optional

from models import Court, Match

logger = logging.getLogger("CourtService")

class CourtService:
    def __init__(self, session: AsyncSession, redis_client: Redis = None):
        self.session = session
        self.redis = redis_client

    def _slugify(self, text: str) -> str:
        """Converts 'Court 1' to 'court-1'."""
        text = text.lower().strip()
        text = re.sub(r'[^\w\s-]', '', text)
        text = re.sub(r'[\s_-]+', '-', text)
        return text

    async def _broadcast_update(self, court: Court):
        """Publishes the current court state to Redis."""
        if not self.redis:
            return
        try:
            data = court.model_dump(mode="json")
            await self.redis.publish(f"court_updates_{court.slug}", json.dumps(data))
        except Exception as e:
            logger.error(f"Redis publish failed: {e}")

    async def get_all_courts(self) -> List[Dict[str, Any]]:
        # Fetch all courts
        courts_res = await self.session.execute(select(Court).order_by(Court.name))
        courts = courts_res.scalars().all()
        
        # Fetch all active matches
        active_matches_res = await self.session.execute(
            select(Match.court_slug).where(Match.status == "in_progress")
        )
        active_slugs = set(active_matches_res.scalars().all())
        
        return [
            {**court.model_dump(), "is_active": court.slug in active_slugs}
            for court in courts
        ]

    async def get_court_by_slug(self, slug: str) -> Dict[str, Any]:
        # 1. Fetch Court
        statement = select(Court).where(Court.slug == slug)
        result = await self.session.execute(statement)
        court = result.scalar_one_or_none()
        if not court:
            raise HTTPException(status_code=404, detail="Court not found")
            
        # 2. Fetch Active Match (Latest match, including finalized ones to keep ticker active)
        match_stmt = select(Match).where(
            Match.court_slug == slug, 
            Match.status.in_(["in_progress", "preparing", "final"])
        ).order_by(Match.created_at.desc()).limit(1)
        
        match_res = await self.session.execute(match_stmt)
        active_match = match_res.scalar_one_or_none()

        # 3. Fetch Match History (Completed)
        history_stmt = select(Match).where(
            Match.court_slug == slug,
            Match.status == "final"
        ).order_by(Match.created_at.desc()).limit(10)
        
        history_res = await self.session.execute(history_stmt)
        match_history = history_res.scalars().all()

        return {
            **court.model_dump(),
            "active_match": active_match,
            "match_history": match_history
        }

    async def create_court(self, name: str) -> Court:
        slug = self._slugify(name)
        
        # Check for duplicates
        existing = await self.session.execute(select(Court).where(Court.slug == slug))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Court with this name/slug already exists")

        court = Court(name=name, slug=slug)
        self.session.add(court)
        await self.session.commit()
        await self.session.refresh(court)
        return court

    async def delete_court(self, slug: str):
        statement = select(Court).where(Court.slug == slug)
        result = await self.session.execute(statement)
        court = result.scalar_one_or_none()
        
        if not court:
            raise HTTPException(status_code=404, detail="Court not found")
            
        await self.session.delete(court)
        await self.session.commit()

    async def update_court(self, slug: str, update_data: Dict[str, Any]) -> Court:
        statement = select(Court).where(Court.slug == slug)
        result = await self.session.execute(statement)
        court = result.scalar_one_or_none()
        
        if not court:
            raise HTTPException(status_code=404, detail="Court not found")
            
        for key, value in update_data.items():
            if hasattr(court, key):
                setattr(court, key, value)
                
        self.session.add(court)
        await self.session.commit()
        await self.session.refresh(court)
        await self._broadcast_update(court)
        return court
