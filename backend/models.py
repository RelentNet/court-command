from sqlmodel import SQLModel, Field, UniqueConstraint, Relationship
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
from sqlalchemy import JSON, Column

# --- Registry Models ---

class Player(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    display_name: str
    handedness: str = "right" # right, left
    skill_rating: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Team(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    short_name: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    
    # Simple JSON list of player IDs for now (e.g. [1, 2])
    # In a larger app, this would be a many-to-many relationship table
    player_ids: List[int] = Field(default=[], sa_column=Column(JSON)) 

class Court(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("slug"),)
    
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    slug: str = Field(index=True)
    is_ticker_visible: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

# --- Match Models ---

class Match(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=lambda: str(uuid.uuid4()), index=True)
    court_slug: Optional[str] = None # Link to a court
    
    status: str = "preparing" # preparing, in_progress, final
    
    # Track specific Team IDs for configuration
    team_1_id: Optional[int] = None
    team_2_id: Optional[int] = None
    
    # Initial Configuration State
    first_serving_team: Optional[int] = 1 # 1 or 2
    
    # Who is playing? (Stores names, seeds, or links to Team IDs)
    # Structure: { "team_1": { "id": 55, "name": "..." }, "team_2": ... }
    participants: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    
    # Rules (Best of 3, etc)
    config: Dict[str, Any] = Field(default={
        "format": "best_of_3",
        "scoring_type": "side_out",
        "points_to": 11,
        "win_by": 2
    }, sa_column=Column(JSON))
    
    # Historic Results (e.g. [{"game_num": 1, "score_team_1": 11, "score_team_2": 9}])
    completed_games: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    
    # --- Live State (The Ticker Data) ---
    current_game_num: int = 1
    
    # Current Game Score
    team_1_score: int = 0
    team_2_score: int = 0
    
    # Serving State
    server_number: int = 1 # 1 or 2
    serving_team: int = 1  # 1 or 2
    
    # Display State
    swap_sides: bool = False
    
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
