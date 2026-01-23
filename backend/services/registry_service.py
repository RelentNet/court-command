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

    async def update_player(self, player_id: int, player_data: Player) -> Player:
        player = await self.session.get(Player, player_id)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        # Update fields
        player.display_name = player_data.display_name
        player.handedness = player_data.handedness
        player.skill_rating = player_data.skill_rating
        
        self.session.add(player)
        await self.session.commit()
        await self.session.refresh(player)
        return player

    async def delete_player(self, player_id: int):
        player = await self.session.get(Player, player_id)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        await self.session.delete(player)
        await self.session.commit()

    # --- Teams ---
    async def get_all_teams(self) -> List[Team]:
        result = await self.session.execute(select(Team).order_by(Team.name))
        return result.scalars().all()

    async def create_team(self, team: Team) -> Team:
        self.session.add(team)
        await self.session.commit()
        await self.session.refresh(team)
        return team

    async def update_team(self, team_id: int, team_data: Team) -> Team:
        team = await self.session.get(Team, team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        
        team.name = team_data.name
        team.short_name = team_data.short_name
        team.primary_color = team_data.primary_color
        team.player_ids = team_data.player_ids
        
        self.session.add(team)
        await self.session.commit()
        await self.session.refresh(team)
        return team

    async def delete_team(self, team_id: int):
        team = await self.session.get(Team, team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        await self.session.delete(team)
        await self.session.commit()

    async def get_team(self, team_id: int) -> Team:
        team = await self.session.get(Team, team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        return team
