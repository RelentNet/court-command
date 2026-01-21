/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Match } from './Match'
export type CourtWithMatch = {
  id: number
  name: string
  slug: string
  created_at: string
  active_match?: Match | null
  match_history?: Array<Match>
}
