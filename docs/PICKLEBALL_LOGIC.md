# Pickleball Domain Logic & System Architecture

## 1. The Core Mechanic: "Side-Out Scoring"

To a developer unfamiliar with the sport, Pickleball's unique scoring system (specifically **Side-Out Scoring**) often looks like a bug. Here is the logic:

### Why only one team scores?

In traditional Pickleball, **only the serving team can score points**.

- **If the Serving Team wins the rally:** They get **+1 Point**. The same server continues serving but switches sides (Left/Right) with their partner.
- **If the Receiving Team wins the rally:** **0 Points** are awarded. This results in a "Loss of Serve."

### The Server Sequence (Doubles)

This is the most complex part of the state machine. Each team has two servers (except for the very first turn of the game).

1.  **Team A, Server 1** serves.
    - _Loss of rally_ -> Serve moves to **Team A, Server 2**.
2.  **Team A, Server 2** serves.
    - _Loss of rally_ -> **SIDE OUT**. Serve moves to **Team B, Server 1**.
3.  **Team B, Server 1** serves.
    - _Loss of rally_ -> Serve moves to **Team B, Server 2**.
4.  **Team B, Server 2** serves.
    - _Loss of rally_ -> **SIDE OUT**. Serve moves to **Team A, Server 1**.

**The "First Server" Exception:**
To minimize the advantage of serving first, the game begins with **Team 1, Server 2**. This means they only get _one_ loss of rally before a Side Out occurs.

---

## 2. Required Data Points (Schema Update Recommendations)

To accurately track this, the `Match` model needs to track not just the score, but the specific _state_ of the servers and player positions.

### Current Fields (In `models.py`)

- `server_number` (1 or 2)
- `serving_team` (1 or 2)
- `team_1_score`
- `team_2_score`

### Missing / Recommended Fields

To support a robust UI (showing _who_ is serving from _which_ side), we need to track player positioning.

```json
{
  "live_state": {
    "server_idx": 2, // 1=Team1First, 2=Team1Second, 3=Team2First, 4=Team2Second
    "team_1_left_player_id": 101,
    "team_1_right_player_id": 102,
    "team_2_left_player_id": 201,
    "team_2_right_player_id": 202
  }
}
```

_Note: In Pickleball, players switch Left/Right sides ONLY when they score a point while serving. They do NOT switch sides on a Side Out._

---

## 3. The "Game Engine" Logic

This logic belongs in `backend/services/match_service.py`.

### Pseudo-Code: Handling a Rally Outcome

```python
def handle_point(match, winning_team_id):
    is_serving_team = (match.serving_team == winning_team_id)

    if match.config.scoring_type == 'side_out':
        if is_serving_team:
            # 1. Award Point
            increment_score(match, winning_team_id)
            # 2. Switch Positions (Serving team only)
            swap_players(match, winning_team_id)
            # 3. Check Game Over
            check_game_over(match)
        else:
            # Receiving team won -> Loss of Serve
            handle_loss_of_serve(match)

    elif match.config.scoring_type == 'rally':
        # Every rally is a point
        increment_score(match, winning_team_id)
        if not is_serving_team:
            handle_loss_of_serve(match) # Rally scoring usually involves rotating on sideout
        check_game_over(match)

def handle_loss_of_serve(match):
    # Logic for 1 -> 2 -> Sideout -> 1
    if match.server_number == 1:
        match.server_number = 2
    else:
        # Side Out
        match.serving_team = 2 if match.serving_team == 1 else 1
        match.server_number = 1
```

---

## 4. Fixing the "Infinite Game" Bug

Currently, the system likely increments points indefinitely. We need a `Game Over` check after every point.

### Winning Conditions

Standard Pickleball rules:

1.  Score reaches **11** (or 15/21, based on config).
2.  Leading team is ahead by **2 points**.

### State Transition Logic

```python
def check_game_over(match):
    points_to = match.config.get('points_to', 11)
    win_by = match.config.get('win_by', 2)

    s1 = match.team_1_score
    s2 = match.team_2_score

    winner = None

    # Check threshold and margin
    if s1 >= points_to and (s1 - s2) >= win_by:
        winner = 1
    elif s2 >= points_to and (s2 - s1) >= win_by:
        winner = 2

    if winner:
        finalize_game(match, winner)

def finalize_game(match, winner):
    # 1. Archive current scores to completed_games
    match.completed_games.append({
        "game_num": match.current_game_num,
        "team_1_score": match.team_1_score,
        "team_2_score": match.team_2_score,
        "winner": winner
    })

    # 2. Check Match Over (Best of X)
    games_needed = (match.config.get('best_of', 3) // 2) + 1
    team_1_wins = count_wins(match.completed_games, 1)
    team_2_wins = count_wins(match.completed_games, 2)

    if team_1_wins >= games_needed or team_2_wins >= games_needed:
        match.status = "final"
        match.winner_team_id = winner
    else:
        # 3. Start Next Game
        match.current_game_num += 1
        match.team_1_score = 0
        match.team_2_score = 0
        match.server_number = 2 # Start next game with 2nd server (standard convention)
        match.serving_team = 1 # Usually winners serve? Or losers? (Configurable)
```

## 5. Summary of Required Changes

1.  **Backend (`match_service.py`):** Implement `check_game_over` logic inside the `add_point` function.
2.  **Backend (`models.py`):** Ensure `Match` model handles status transitions (`in_progress` -> `final`).
3.  **Frontend:** Update `Scoreboard` to show "Game Over" or "Match Over" when status changes, blocking further input.
