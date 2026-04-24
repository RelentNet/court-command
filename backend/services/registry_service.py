from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from typing import List

from models import Player, Team, MatchPreset

class RegistryService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # --- Presets ---
    async def get_all_presets(self) -> List[MatchPreset]:
        result = await self.session.execute(select(MatchPreset).order_by(MatchPreset.category, MatchPreset.value))
        return result.scalars().all()

    async def create_preset(self, preset: MatchPreset) -> MatchPreset:
        self.session.add(preset)
        await self.session.commit()
        await self.session.refresh(preset)
        return preset

    async def delete_preset(self, preset_id: int):
        preset = await self.session.get(MatchPreset, preset_id)
        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")
        await self.session.delete(preset)
        await self.session.commit()

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
            
        # Clean up teams that have this player
        # Since player_ids is a JSON array, we can't easily query with SQL alone efficiently
        # without native JSON operators (which we could use, but iterating logic is simpler for this scope).
        # We'll fetch all teams and check python-side. For small scale this is fine.
        stmt = select(Team)
        result = await self.session.execute(stmt)
        all_teams = result.scalars().all()
        
        for team in all_teams:
            if player_id in team.player_ids:
                team.player_ids.remove(player_id)
                # Force SQLAlchemy to see the change in MutableList (JSON)
                team.player_ids = list(team.player_ids) 
                self.session.add(team)
        
        await self.session.delete(player)
        await self.session.commit()

    # --- Teams ---
    async def get_all_teams(self) -> List[Team]:
        result = await self.session.execute(select(Team).order_by(Team.name))
        return result.scalars().all()

    async def create_team(self, team: Team) -> Team:
        # Check for duplicate name
        stmt = select(Team).where(Team.name == team.name)
        existing = await self.session.execute(stmt)
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Team with this name already exists")

        self.session.add(team)
        await self.session.commit()
        await self.session.refresh(team)
        return team

    async def update_team(self, team_id: int, team_data: Team) -> Team:
        team = await self.session.get(Team, team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        
        # Check for duplicate name if name changed
        if team_data.name != team.name:
            stmt = select(Team).where(Team.name == team_data.name)
            existing = await self.session.execute(stmt)
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Team with this name already exists")
        
        team.name = team_data.name
        team.short_name = team_data.short_name
        team.logo_url = team_data.logo_url
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
