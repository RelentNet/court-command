// Logto access-token JWT customizer. Logto lets a tenant register a single
// JavaScript "custom JWT claims" function per token type that runs at token
// issuance and returns extra claims to merge into the token. The Mgmt API
// surface for the access-token customizer is:
//
//	PUT /api/configs/jwt-customizer/access-token   -- upsert the script + samples
//
// Court Command uses this to emit the RFC 8693 `act` (actor) claim on the
// access tokens minted via OAuth 2.0 Token Exchange (admin impersonation).
// Logto's token-exchange grant carries the subject-token context through to
// the customizer as `context.grant.subjectTokenContext`; without a customizer
// that copies those fields into `act`, the issued impersonation token has NO
// `act` claim and the backend (api/auth/context.go actorSubject) and SPA
// impersonation banner never detect the impersonation.

package logto

import (
	"context"
	"net/http"
)

// AccessTokenJWTCustomizerScript is the JavaScript getCustomJwtClaims function
// installed as the access-token JWT customizer. On token-exchange grants it
// copies the impersonator identity out of the subject-token context into an
// RFC 8693 `act` claim; act.sub is the impersonator's Logto user ID (a STRING,
// as both api/auth/context.go:actorSubject and the SPA expect). It returns no
// extra claims on every other grant type.
const AccessTokenJWTCustomizerScript = `const getCustomJwtClaims = async ({ token, context }) => { if (context.grant && context.grant.type === 'urn:ietf:params:oauth:grant-type:token-exchange') { const ctx = context.grant.subjectTokenContext || {}; return { act: { sub: ctx.impersonator_logto_id, public_id: ctx.impersonator_public_id, reason: ctx.reason } }; } return {}; };`

// JWTCustomizerParams is the body for PUT /api/configs/jwt-customizer/access-token.
//
// ContextSample is REQUIRED by Logto's Zod guard even though it is only used to
// validate the script in the Console test runner -- omitting context.user (or
// passing an empty contextSample) returns HTTP 400. The grant sample mirrors
// the real token-exchange context shape so an operator testing the script in
// the Console sees a representative payload.
type JWTCustomizerParams struct {
	Script               string                 `json:"script"`
	EnvironmentVariables map[string]interface{} `json:"environmentVariables"`
	ContextSample        map[string]interface{} `json:"contextSample"`
}

// UpsertAccessTokenJWTCustomizer installs (or replaces) the access-token JWT
// customizer script. PUT is an upsert, so this is idempotent -- the seeder
// always PUTs the current script. See AccessTokenJWTCustomizerScript for what
// the installed script does and why.
func (c *Client) UpsertAccessTokenJWTCustomizer(ctx context.Context) error {
	return c.doJSON(ctx, http.MethodPut, "/api/configs/jwt-customizer/access-token", JWTCustomizerParams{
		Script:               AccessTokenJWTCustomizerScript,
		EnvironmentVariables: map[string]interface{}{},
		ContextSample: map[string]interface{}{
			// context.user is required by Logto's Zod guard (HTTP 400 otherwise).
			"user": map[string]interface{}{
				"id":           "sample",
				"primaryEmail": "sample@example.com",
			},
			"grant": map[string]interface{}{
				"type": "urn:ietf:params:oauth:grant-type:token-exchange",
				"subjectTokenContext": map[string]interface{}{
					"impersonator_logto_id":  "sample",
					"impersonator_public_id": "CC-00000",
					"reason":                 "court_command_admin_impersonation",
				},
			},
		},
	}, nil)
}
