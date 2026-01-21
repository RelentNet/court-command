/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Court } from '../models/Court'
import type { CourtSummary } from '../models/CourtSummary'
import type { CourtWithMatch } from '../models/CourtWithMatch'
import type { CreateCourtRequest } from '../models/CreateCourtRequest'
import type { Match } from '../models/Match'
import type { Player } from '../models/Player'
import type { Team } from '../models/Team'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
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
    })
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
    })
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
    })
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
    })
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
    })
  }
  /**
   * Get Team
   * @param teamId
   * @returns Team Successful Response
   * @throws ApiError
   */
  public static getTeamTeamsTeamIdGet(teamId: number): CancelablePromise<Team> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/teams/{team_id}',
      path: {
        team_id: teamId,
      },
      errors: {
        422: `Validation Error`,
      },
    })
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
    })
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
    })
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
        slug: slug,
      },
      errors: {
        422: `Validation Error`,
      },
    })
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
        slug: slug,
      },
      errors: {
        422: `Validation Error`,
      },
    })
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
    })
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
        public_id: publicId,
      },
      errors: {
        422: `Validation Error`,
      },
    })
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
        public_id: publicId,
      },
      errors: {
        422: `Validation Error`,
      },
    })
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
        public_id: publicId,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }
  /**
   * Undo Last Event
   * @param publicId
   * @returns any Successful Response
   * @throws ApiError
   */
  public static undoLastEventMatchesPublicIdUndoPost(
    publicId: string,
  ): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/matches/{public_id}/undo',
      path: {
        public_id: publicId,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }
}
