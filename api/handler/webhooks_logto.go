// api/handler/webhooks_logto.go
//
// LogtoWebhookHandler verifies HMAC-SHA-256 signatures on the
// POST /api/v1/webhooks/logto endpoint and dispatches three event
// types to the central UserSyncService:
//
//   - User.Created       => UserSyncService.UpsertFromLogto (insert)
//   - User.Data.Updated  => UserSyncService.UpsertFromLogto (update)
//   - User.Deleted       => UserSyncService.SoftDelete
//
// Unknown event types return 204 so Logto stops retrying them. Every
// other failure (bad signature, malformed JSON, DB error) returns a
// structured error envelope so it's actionable from the Logto admin
// "Recent deliveries" UI.
//
// This handler is mounted publicly (no auth middleware) -- the HMAC
// signature IS the auth. The signing key comes from the
// LOGTO_WEBHOOK_SIGNING_KEY environment variable (set by the seeder
// run that registers the webhook in Logto).
package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/court-command/court-command/service"
)

// LogtoWebhookHandler binds the user-sync service + signing key to the
// Handle method registered by the router.
type LogtoWebhookHandler struct {
	userSync   *service.UserSyncService
	signingKey string
}

// NewLogtoWebhookHandler returns a handler ready to mount.
//
// signingKey may be empty (e.g. webhook intentionally disabled in a
// test environment); in that case Handle short-circuits with a 500
// "INTERNAL_ERROR" so a misconfigured production env can't silently
// accept unsigned requests.
func NewLogtoWebhookHandler(s *service.UserSyncService, signingKey string) *LogtoWebhookHandler {
	return &LogtoWebhookHandler{userSync: s, signingKey: signingKey}
}

// logtoWebhookEnvelope is the subset of the Logto webhook payload
// shape we consume. Logto sends additional metadata fields (createdAt,
// hookId, etc.) which we ignore.
type logtoWebhookEnvelope struct {
	Event  string            `json:"event"`
	UserID string            `json:"userId"`
	User   *logtoUserPayload `json:"user,omitempty"`
}

type logtoUserPayload struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	PrimaryEmail string `json:"primaryEmail"`
	Name         string `json:"name"`
}

// Handle is the http.HandlerFunc for POST /api/v1/webhooks/logto.
//
// Order of checks:
//  1. Signing key configured? (500 if not)
//  2. Body readable? (400 READ_BODY)
//  3. HMAC signature matches? (401 BAD_SIGNATURE -- constant-time compare)
//  4. JSON parseable? (400 BAD_JSON)
//  5. Event dispatch -- known events execute their service call;
//     unknown events return 204 so Logto doesn't retry them forever.
func (h *LogtoWebhookHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if h.signingKey == "" {
		WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "webhook signing key not configured")
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "READ_BODY", err.Error())
		return
	}
	// Logto sends "logto-signature-sha-256" (lowercase, no X- prefix).
	// http.Header.Get is case-insensitive, so the canonical title-case
	// form here matches the wire-level lowercase header.
	got := r.Header.Get("Logto-Signature-Sha-256")
	mac := hmac.New(sha256.New, []byte(h.signingKey))
	mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(got), []byte(want)) {
		slog.WarnContext(r.Context(), "webhook signature mismatch", "got_len", len(got))
		WriteError(w, http.StatusUnauthorized, "BAD_SIGNATURE", "signature mismatch")
		return
	}

	var env logtoWebhookEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		WriteError(w, http.StatusBadRequest, "BAD_JSON", err.Error())
		return
	}

	switch env.Event {
	case "User.Created", "User.Data.Updated":
		if env.User == nil {
			WriteError(w, http.StatusBadRequest, "MISSING_USER", "no user payload")
			return
		}
		first, last := splitName(env.User.Name)
		if err := h.userSync.UpsertFromLogto(r.Context(), service.LogtoUserUpsert{
			LogtoUserID: env.User.ID,
			Email:       env.User.PrimaryEmail,
			FirstName:   first,
			LastName:    last,
			DisplayName: env.User.Name,
		}); err != nil {
			slog.ErrorContext(r.Context(), "user upsert failed", "event", env.Event, "err", err)
			HandleServiceError(w, err)
			return
		}
	case "User.Deleted":
		if err := h.userSync.SoftDelete(r.Context(), env.UserID); err != nil {
			slog.ErrorContext(r.Context(), "user delete failed", "err", err)
			HandleServiceError(w, err)
			return
		}
	default:
		// Unknown events: 204 so Logto stops retrying. We log them so
		// operators can spot a new event type that should be handled.
		slog.InfoContext(r.Context(), "unhandled webhook event", "event", env.Event)
	}
	NoContent(w)
}

// splitName splits a Logto display name into first/last on the first
// space. "Alice Bob Carol" => ("Alice", "Bob Carol"). An empty or
// whitespace-only name returns two empty strings; the caller should
// decide whether that's worth surfacing.
func splitName(full string) (first, last string) {
	parts := strings.SplitN(strings.TrimSpace(full), " ", 2)
	if len(parts) == 0 || parts[0] == "" {
		return "", ""
	}
	first = parts[0]
	if len(parts) > 1 {
		last = parts[1]
	}
	return
}
