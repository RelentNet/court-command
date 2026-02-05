/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Match = {
    id?: (number | null);
    public_id?: string;
    court_slug?: (string | null);
    status?: string;
    league_name?: (string | null);
    tournament_name?: (string | null);
    match_info?: (string | null);
    team_1_id?: (number | null);
    team_2_id?: (number | null);
    first_serving_team?: (number | null);
    participants?: Record<string, any>;
    config?: Record<string, any>;
    completed_games?: Array<Record<string, any>>;
    current_game_num?: number;
    team_1_score?: number;
    team_2_score?: number;
    server_number?: number;
    serving_team?: number;
    swap_sides?: boolean;
    created_at?: string;
};

