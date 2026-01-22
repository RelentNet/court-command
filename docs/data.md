### Players

- **id**: Unique identifier.
- **display_name**: The name shown on the ticker.
- **stats_summary**: Career wins/losses.

### Teams

- **id**: Unique identifier.
- **name**: Full team name.
- **name_short**: 3-4 letter abbreviation (e.g., "NSH" for Nashville).
- **logo_url**: Path to team icon.
- **players**: List of player IDs (typically 1 for singles, 2 for doubles).
- **primary_color**: Useful for UI color-coding the ticker.

### Courts

- **id**: Unique identifier.
- **court_number/name**: e.g., "Court 1" or "Championship Court."
- **location_id**: If the app supports multiple venues.
- **status**: Available, Occupied, Maintenance.

### Matches

- **match_id**: Unique identifier.
- **type**: Singles or Doubles.
- **format**: Best of 3, Games to 15, etc.
- **current_score**:
- `team_1_score`
- `team_2_score`
- `server_number`

- **serving_team_id**: Which team is currently serving.
- **active_server_id**: The specific player currently serving.
- **starting_server_id**: Necessary to track "First Server" rules.
- **sides**: Which team is on the "North" vs "South" side (for UI positioning).
- **match_status**: Warm-up, In-Progress, Final, Forfeit.
