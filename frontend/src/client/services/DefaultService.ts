/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ConfigureMatchRequest } from '../models/ConfigureMatchRequest';
import type { Court } from '../models/Court';
import type { CourtSummary } from '../models/CourtSummary';
import type { CourtWithMatch } from '../models/CourtWithMatch';
import type { CreateCourtRequest } from '../models/CreateCourtRequest';
import type { Match } from '../models/Match';
import type { MatchPreset } from '../models/MatchPreset';
import type { Player } from '../models/Player';
import type { Team } from '../models/Team';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DefaultService {
    /**
     * Health Check
     * @returns any Successful Response
     * @throws ApiError
     */
    public static healthCheckHealthGet(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health',
        });
    }
    /**
     * Get Presets
     * @returns MatchPreset Successful Response
     * @throws ApiError
     */
    public static getPresetsPresetsGet(): CancelablePromise<Array<MatchPreset>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/presets',
        });
    }
    /**
     * Create Preset
     * @param requestBody
     * @returns MatchPreset Successful Response
     * @throws ApiError
     */
    public static createPresetPresetsPost(
        requestBody: MatchPreset,
    ): CancelablePromise<MatchPreset> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/presets',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Preset
     * @param presetId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deletePresetPresetsPresetIdDelete(
        presetId: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/presets/{preset_id}',
            path: {
                'preset_id': presetId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Players
     * @returns Player Successful Response
     * @throws ApiError
     */
    public static getPlayersPlayersGet(): CancelablePromise<Array<Player>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/players',
        });
    }
    /**
     * Create Player
     * @param requestBody
     * @returns Player Successful Response
     * @throws ApiError
     */
    public static createPlayerPlayersPost(
        requestBody: Player,
    ): CancelablePromise<Player> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/players',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Player
     * @param playerId
     * @param requestBody
     * @returns Player Successful Response
     * @throws ApiError
     */
    public static updatePlayerPlayersPlayerIdPut(
        playerId: number,
        requestBody: Player,
    ): CancelablePromise<Player> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/players/{player_id}',
            path: {
                'player_id': playerId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Player
     * @param playerId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deletePlayerPlayersPlayerIdDelete(
        playerId: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/players/{player_id}',
            path: {
                'player_id': playerId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Teams
     * @returns Team Successful Response
     * @throws ApiError
     */
    public static getTeamsTeamsGet(): CancelablePromise<Array<Team>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/teams',
        });
    }
    /**
     * Create Team
     * @param requestBody
     * @returns Team Successful Response
     * @throws ApiError
     */
    public static createTeamTeamsPost(
        requestBody: Team,
    ): CancelablePromise<Team> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/teams',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Team
     * @param teamId
     * @param requestBody
     * @returns Team Successful Response
     * @throws ApiError
     */
    public static updateTeamTeamsTeamIdPut(
        teamId: number,
        requestBody: Team,
    ): CancelablePromise<Team> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/teams/{team_id}',
            path: {
                'team_id': teamId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Team
     * @param teamId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteTeamTeamsTeamIdDelete(
        teamId: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/teams/{team_id}',
            path: {
                'team_id': teamId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Team
     * @param teamId
     * @returns Team Successful Response
     * @throws ApiError
     */
    public static getTeamTeamsTeamIdGet(
        teamId: number,
    ): CancelablePromise<Team> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/teams/{team_id}',
            path: {
                'team_id': teamId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Courts
     * @returns CourtSummary Successful Response
     * @throws ApiError
     */
    public static getCourtsCourtsGet(): CancelablePromise<Array<CourtSummary>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/courts',
        });
    }
    /**
     * Create Court
     * @param requestBody
     * @returns Court Successful Response
     * @throws ApiError
     */
    public static createCourtCourtsPost(
        requestBody: CreateCourtRequest,
    ): CancelablePromise<Court> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/courts',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Court
     * @param slug
     * @returns CourtWithMatch Successful Response
     * @throws ApiError
     */
    public static getCourtCourtsSlugGet(
        slug: string,
    ): CancelablePromise<CourtWithMatch> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/courts/{slug}',
            path: {
                'slug': slug,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Court
     * @param slug
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteCourtCourtsSlugDelete(
        slug: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/courts/{slug}',
            path: {
                'slug': slug,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Court
     * @param slug
     * @param requestBody
     * @returns Court Successful Response
     * @throws ApiError
     */
    public static updateCourtCourtsSlugPatch(
        slug: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<Court> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/courts/{slug}',
            path: {
                'slug': slug,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Match
     * @param requestBody
     * @returns Match Successful Response
     * @throws ApiError
     */
    public static createMatchMatchesPost(
        requestBody: Match,
    ): CancelablePromise<Match> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/matches',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Match
     * @param publicId
     * @returns Match Successful Response
     * @throws ApiError
     */
    public static getMatchMatchesPublicIdGet(
        publicId: string,
    ): CancelablePromise<Match> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/matches/{public_id}',
            path: {
                'public_id': publicId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Match
     * @param publicId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteMatchMatchesPublicIdDelete(
        publicId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/matches/{public_id}',
            path: {
                'public_id': publicId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Add Point
     * @param publicId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static addPointMatchesPublicIdPointPost(
        publicId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/matches/{public_id}/point',
            path: {
                'public_id': publicId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Side Out
     * @param publicId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static sideOutMatchesPublicIdSideoutPost(
        publicId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/matches/{public_id}/sideout',
            path: {
                'public_id': publicId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * End Game
     * @param publicId
     * @returns Match Successful Response
     * @throws ApiError
     */
    public static endGameMatchesPublicIdEndGamePost(
        publicId: string,
    ): CancelablePromise<Match> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/matches/{public_id}/end-game',
            path: {
                'public_id': publicId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * End Match
     * @param publicId
     * @returns Match Successful Response
     * @throws ApiError
     */
    public static endMatchMatchesPublicIdEndMatchPost(
        publicId: string,
    ): CancelablePromise<Match> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/matches/{public_id}/end-match',
            path: {
                'public_id': publicId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Undo Last Event
     * @param publicId
     * @returns Match Successful Response
     * @throws ApiError
     */
    public static undoLastEventMatchesPublicIdUndoPost(
        publicId: string,
    ): CancelablePromise<Match> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/matches/{public_id}/undo',
            path: {
                'public_id': publicId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Reset Match
     * @param publicId
     * @returns Match Successful Response
     * @throws ApiError
     */
    public static resetMatchMatchesPublicIdResetPost(
        publicId: string,
    ): CancelablePromise<Match> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/matches/{public_id}/reset',
            path: {
                'public_id': publicId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Swap Teams
     * @param publicId
     * @returns Match Successful Response
     * @throws ApiError
     */
    public static swapTeamsMatchesPublicIdSwapTeamsPost(
        publicId: string,
    ): CancelablePromise<Match> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/matches/{public_id}/swap-teams',
            path: {
                'public_id': publicId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Rematch
     * @param publicId
     * @returns Match Successful Response
     * @throws ApiError
     */
    public static rematchMatchesPublicIdRematchPost(
        publicId: string,
    ): CancelablePromise<Match> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/matches/{public_id}/rematch',
            path: {
                'public_id': publicId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Configure Match
     * @param publicId
     * @param requestBody
     * @returns Match Successful Response
     * @throws ApiError
     */
    public static configureMatchMatchesPublicIdConfigurePatch(
        publicId: string,
        requestBody: ConfigureMatchRequest,
    ): CancelablePromise<Match> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/matches/{public_id}/configure',
            path: {
                'public_id': publicId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
