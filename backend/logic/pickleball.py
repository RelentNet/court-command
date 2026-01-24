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
            
        # 2. Check Game Over
        points_to = match.config.get("points_to", 11)
        win_by = match.config.get("win_by", 2)
        
        t1 = match.team_1_score
        t2 = match.team_2_score
        
        game_won = False
        winner = None
        
        if t1 >= points_to and (t1 - t2) >= win_by:
            game_won = True
            winner = 1
        elif t2 >= points_to and (t2 - t1) >= win_by:
            game_won = True
            winner = 2
            
        if game_won:
            # Archive Result
            match.completed_games.append({
                "game_num": match.current_game_num,
                "score_team_1": t1,
                "score_team_2": t2,
                "winner": winner
            })
            
            # Check Match Over (Best of X)
            format_str = match.config.get("format", "best_of_3")
            try:
                best_of = int(format_str.split("_")[-1])
            except:
                best_of = 3
                
            games_needed = (best_of // 2) + 1
            
            # Count wins
            wins_1 = sum(1 for g in match.completed_games if g.get("winner") == 1)
            wins_2 = sum(1 for g in match.completed_games if g.get("winner") == 2)
            
            if wins_1 >= games_needed or wins_2 >= games_needed:
                match.status = "final"
            else:
                # Reset for next game
                match.team_1_score = 0
                match.team_2_score = 0
                match.current_game_num += 1
                match.server_number = 1
                match.serving_team = 1 # Default to Team 1
        
        return {"action": "point", "team": match.serving_team, "game_won": game_won, "match_over": match.status == "final"}

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
