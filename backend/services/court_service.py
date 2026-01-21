from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
import re
from typing import List

from models import Court

class CourtService:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _slugify(self, text: str) -> str:
        """Converts 'Court 1' to 'court-1'."""
        text = text.lower().strip()
        text = re.sub(r'[^\w\s-]', '', text)
        text = re.sub(r'[\s_-]+', '-', text)
        return text

    async def get_all_courts(self) -> List[Court]:
        statement = select(Court).order_by(Court.name)
        result = await self.session.execute(statement)
        return result.scalars().all()

    async def get_court_by_slug(self, slug: str) -> Court:
        statement = select(Court).where(Court.slug == slug)
        result = await self.session.execute(statement)
        court = result.scalar_one_or_none()
        if not court:
            raise HTTPException(status_code=404, detail="Court not found")
        return court

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
        court = await self.get_court_by_slug(slug)
        await self.session.delete(court)
        await self.session.commit()
