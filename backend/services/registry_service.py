from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from typing import List

from models import Player, Team

class RegistryService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # --- Players ---
    async def get_all_players(self) -> List[Player]:
        result = await self.session.execute(select(Player).order_by(Player.display_name))
        return result.scalars().all()

    async def create_player(self, player: Player) -> Player:
        self.session.add(player)
        await self.session.commit()
        await self.session.refresh(player)
        return player

    # --- Teams ---
    async def get_all_teams(self) -> List[Team]:
        result = await self.session.execute(select(Team).order_by(Team.name))
        return result.scalars().all()

    async def create_team(self, team: Team) -> Team:
        self.session.add(team)
        await self.session.commit()
        await self.session.refresh(team)
        return team

    async def get_team(self, team_id: int) -> Team:
        team = await self.session.get(Team, team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        return team
