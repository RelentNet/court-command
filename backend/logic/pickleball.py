from models import Match
from typing import Dict, Any

class PickleballEngine:
    @staticmethod
    def process_point(match: Match) -> Dict[str, Any]:
        """
        Updates the match state for a point scored by the serving team.
        Returns payload for the event log.
        """
        # 1. Update Score
        if match.serving_team == 1:
            match.team_1_score += 1
        else:
            match.team_2_score += 1
            
        return {"action": "point", "team": match.serving_team}

    @staticmethod
    def process_end_game(match: Match) -> Dict[str, Any]:
        """
        Manually ends the current game, archives the score, and resets for the next game.
        """
        t1 = match.team_1_score
        t2 = match.team_2_score
        
        # Determine winner based on current score
        winner = 1 if t1 > t2 else 2
        
        # Archive Result
        match.completed_games.append({
            "game_num": match.current_game_num,
            "score_team_1": t1,
            "score_team_2": t2,
            "winner": winner
        })
        
        # Reset for next game
        match.team_1_score = 0
        match.team_2_score = 0
        match.current_game_num += 1
        match.server_number = 1
        match.serving_team = 1 # Default to Team 1
        
        return {"action": "end_game", "winner": winner}

    @staticmethod
    def process_end_match(match: Match) -> Dict[str, Any]:
        """
        Manually ends the match and sets status to final.
        """
        match.status = "final"
        return {"action": "end_match"}

    @staticmethod
    def process_side_out(match: Match) -> Dict[str, Any]:
        """
        Updates the match state for a side out (server rotation).
        Returns payload for the event log.
        """
        old_server = match.server_number
        old_serving_team = match.serving_team

        # Logic: Standard Pickleball Double Rotation
        # T1P1 -> T1P2 -> Side Out -> T2P1 -> T2P2 -> Side Out -> T1P1
        
        if match.server_number == 1:
            # First server lost serve, move to second server of SAME team
            match.server_number = 2
        else:
            # Second server lost serve, Side Out to OTHER team, reset to Server 1
            match.server_number = 1
            match.serving_team = 2 if match.serving_team == 1 else 1
            
        return {
            "prev_server": old_server,
            "prev_team": old_serving_team,
            "new_server": match.server_number,
            "new_team": match.serving_team
        }