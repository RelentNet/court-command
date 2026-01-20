from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid

class Match(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=lambda: str(uuid.uuid4()), index=True)
    court_name: str
    team_1_name: str = "Team 1"
    team_2_name: str = "Team 2"
    
    # Current Score State (Optimization for fast reads)
    server_number: int = 1 # 1 or 2
    serving_team: int = 1  # 1 or 2
    team_1_score: int = 0
    team_2_score: int = 0
    
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MatchEvent(SQLModel, table=True):
    """The Immutable Log of History"""
    id: Optional[int] = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id")
    event_type: str # POINT, SIDEOUT, UNDO
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    description: str