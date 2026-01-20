from sqlmodel import SQLModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
from sqlalchemy import JSON, Column

class Match(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=lambda: str(uuid.uuid4()), index=True)
    court_name: str
    
    # Team 1 Configuration
    team_1_name: str = "Team 1"
    team_1_short: Optional[str] = None
    team_1_logo_url: Optional[str] = None
    team_1_player1: Optional[str] = None
    team_1_player2: Optional[str] = None
    
    # Team 2 Configuration
    team_2_name: str = "Team 2"
    team_2_short: Optional[str] = None
    team_2_logo_url: Optional[str] = None
    team_2_player1: Optional[str] = None
    team_2_player2: Optional[str] = None
    
    # Match Configuration
    best_of_games: int = 3 # 1, 3, 5
    start_on_server_2: bool = False # For 0-0-2 start
    
    # Current State
    current_game_num: int = 1
    server_number: int = 1 # 1 or 2
    serving_team: int = 1  # 1 or 2
    team_1_score: int = 0
    team_2_score: int = 0
    
    # Display State
    swap_sides: bool = False # If true, Team 1 is displayed on right
    
    # Infractions (Stored as JSON lists of strings e.g. ["TO", "TW"])
    team_1_infractions: List[str] = Field(default=[], sa_column=Column(JSON))
    team_2_infractions: List[str] = Field(default=[], sa_column=Column(JSON))
    
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MatchEvent(SQLModel, table=True):
    """The Immutable Log of History"""
    id: Optional[int] = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id")
    
    sequence_id: int # 1, 2, 3... order for this specific match
    event_type: str # POINT_SCORED, SIDE_OUT, GAME_COMPLETE, INFRACTION, UNDO
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    # The Payload - What changed?
    payload: Dict[str, Any] = Field(default={}, sa_column=Column(JSON)) 
    
    # The Snapshot - Score AFTER this event
    score_snapshot: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
