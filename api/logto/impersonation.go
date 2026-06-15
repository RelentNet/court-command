package logto

import (
	"context"
	"net/http"
)

// SubjectTokenParams is the body for POST /api/subject-tokens.
//
// UserID is the Logto user ID being impersonated (the eventual `sub` of the
// exchanged access token). Context is an optional free-form object Logto
// embeds in the impersonation token's actor context -- Court Command uses it
// to carry the impersonator's identity and an audit reason so the signal is
// visible end-to-end (in Logto's logs, in the issued token, and in our
// activity_logs row).
type SubjectTokenParams struct {
	UserID  string                 `json:"userId"`
	Context map[string]interface{} `json:"context,omitempty"`
}

// SubjectToken is the response of POST /api/subject-tokens. The subjectToken
// is a single-use, short-lived (~10 min) opaque token the frontend exchanges
// at Logto's /oidc/token endpoint with
// grant_type=urn:ietf:params:oauth:grant-type:token-exchange to receive an
// access token whose `sub` is the impersonated user and whose `act.sub` is the
// impersonating admin (RFC 8693 actor claim).
type SubjectToken struct {
	SubjectToken string `json:"subjectToken"`
}

// CreateSubjectToken mints a subject token for impersonating userID via the
// Logto Management API (POST /api/subject-tokens). This is step 1 of the
// OAuth 2.0 Token Exchange impersonation flow (RFC 8693, see Logto docs:
// https://docs.logto.io/developers/user-impersonation).
//
// The returned subject token is NOT itself an access token -- it must be
// exchanged by the SPA (which holds the admin's actor token) at Logto's
// /oidc/token endpoint. The exchange is intentionally performed client-side
// so the impersonated access token never transits Court Command's backend;
// the backend only authorizes the request, mints the subject token, and
// writes the audit-log entry.
//
// ctxData is embedded as the subject-token `context` for audit visibility;
// pass nil if there is nothing to attach.
func (c *Client) CreateSubjectToken(ctx context.Context, userID string, ctxData map[string]interface{}) (*SubjectToken, error) {
	var out SubjectToken
	if err := c.doJSON(ctx, http.MethodPost, "/api/subject-tokens", SubjectTokenParams{
		UserID:  userID,
		Context: ctxData,
	}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
