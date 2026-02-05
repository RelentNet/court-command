from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from models import Match

class CreateCourtRequest(BaseModel):
    name: str

class CourtSummary(BaseModel):
    id: int
    name: str
    slug: str
    is_ticker_visible: bool = True
    created_at: datetime
    is_active: bool = False

class CourtWithMatch(BaseModel):
    id: int
    name: str
    slug: str
    is_ticker_visible: bool = True
    created_at: datetime
    active_match: Optional[Match] = None
    match_history: List[Match] = []

class ConfigureMatchRequest(BaseModel):
    team_1_id: Optional[int] = None
    team_2_id: Optional[int] = None
    first_serving_team: Optional[int] = None
    status: Optional[str] = None
    league_name: Optional[str] = None
    tournament_name: Optional[str] = None
    match_info: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    participants: Optional[Dict[str, Any]] = None
