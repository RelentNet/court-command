// api/handler/webhooks_logto_test.go
//
// End-to-end tests for the Logto webhook endpoint. Each test posts a
// real HTTP request to a testutil.TestServer (which mounts the actual
// router and a Postgres-backed UserSyncService) and verifies both the
// HTTP response and the resulting users-table state.
//
// The tests build their own LogtoWebhookHandler + UserSyncService
// against the test pool and mount them on a separate chi router so
// the signing key can be set per-test without polluting environment
// variables. testutil.TestServer doesn't (yet) wire the webhook
// handler -- but it doesn't need to; everything Task 9 cares about is
// covered by exercising the handler directly.
package handler_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/handler"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/testutil"
)

// signWebhook computes the hex-encoded HMAC-SHA-256 of body under key,
// matching what Logto sends in the Logto-Signature-Sha-256 header.
func signWebhook(key, body []byte) string {
	mac := hmac.New(sha256.New, key)
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// webhookFixture builds an httptest server that mounts ONLY the Logto
// webhook handler at /api/v1/webhooks/logto. Returns the server URL
// and a teardown is registered via t.Cleanup. The signing key is
// stored on the closure-bound handler so callers can sign matching
// payloads.
type webhookFixture struct {
	url        string
	signingKey []byte
	pool       *pgxpool.Pool
}

func newWebhookFixture(t *testing.T, signingKey string) *webhookFixture {
	t.Helper()
	pool := testutil.TestDB(t)
	q := generated.New(pool)
	uss := service.NewUserSyncService(q)
	wh := handler.NewLogtoWebhookHandler(uss, signingKey)

	r := chi.NewRouter()
	r.Post("/api/v1/webhooks/logto", wh.Handle)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)

	return &webhookFixture{
		url:        ts.URL,
		signingKey: []byte(signingKey),
		pool:       pool,
	}
}

// postWebhook posts the given body to the fixture, optionally with a
// pre-computed signature header. If sig is empty, no header is sent.
func (f *webhookFixture) postWebhook(t *testing.T, body []byte, sig string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, f.url+"/api/v1/webhooks/logto", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if sig != "" {
		// Title-case header matches the lowercase wire form
		// (HTTP headers are case-insensitive on retrieval).
		req.Header.Set("Logto-Signature-Sha-256", sig)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	return resp
}

// cleanupUser hard-deletes a users row by logto_user_id at test
// teardown so re-runs don't collide on the unique partial index.
func cleanupUser(t *testing.T, pool *pgxpool.Pool, logtoID string) {
	t.Helper()
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE logto_user_id = $1`, logtoID)
	})
}

// TestWebhook_RejectsBadSignature verifies the signature gate. We
// deliberately use the WRONG header name to also guard against the
// "X-Logto-Signature-SHA-256" regression (amendment A7): even with a
// correct HMAC value, the wrong header name means the handler reads
// "" and rejects.
func TestWebhook_RejectsBadSignature(t *testing.T) {
	f := newWebhookFixture(t, "test-key")
	body := []byte(`{"event":"User.Created","userId":"u1","user":{"id":"u1","primaryEmail":"x@y.z"}}`)

	// Wrong signature value.
	resp := f.postWebhook(t, body, "deadbeef")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Correct signature, wrong header name (X- prefix). Build the
	// request manually to set the wrong header.
	req, _ := http.NewRequest(http.MethodPost, f.url+"/api/v1/webhooks/logto", bytes.NewReader(body))
	req.Header.Set("X-Logto-Signature-SHA-256", signWebhook(f.signingKey, body))
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusUnauthorized {
		t.Fatalf("wrong-header-name request: expected 401, got %d", resp2.StatusCode)
	}
}

// TestWebhook_AcceptsValidSignature_Created_InsertsUser verifies the
// happy path for User.Created: 204 No Content + a row in the users
// table with the expected fields populated.
func TestWebhook_AcceptsValidSignature_Created_InsertsUser(t *testing.T) {
	f := newWebhookFixture(t, "test-key")

	logtoID := "logto_test_webhook_create"
	cleanupUser(t, f.pool, logtoID)

	payload := map[string]interface{}{
		"event":  "User.Created",
		"userId": logtoID,
		"user": map[string]interface{}{
			"id":           logtoID,
			"primaryEmail": "alice.created@example.com",
			"name":         "Alice Wonder",
		},
	}
	body, _ := json.Marshal(payload)
	sig := signWebhook(f.signingKey, body)

	resp := f.postWebhook(t, body, sig)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}

	// Verify the row landed.
	var (
		gotEmail     *string
		gotFirstName string
		gotLastName  string
		gotStatus    string
	)
	err := f.pool.QueryRow(context.Background(),
		`SELECT email, first_name, last_name, status FROM users WHERE logto_user_id = $1`,
		logtoID).Scan(&gotEmail, &gotFirstName, &gotLastName, &gotStatus)
	if err != nil {
		t.Fatalf("query inserted user: %v", err)
	}
	if gotEmail == nil || *gotEmail != "alice.created@example.com" {
		t.Errorf("email: got %v want alice.created@example.com", gotEmail)
	}
	if gotFirstName != "Alice" {
		t.Errorf("first_name: got %q want Alice", gotFirstName)
	}
	if gotLastName != "Wonder" {
		t.Errorf("last_name: got %q want Wonder", gotLastName)
	}
	if gotStatus != "active" {
		t.Errorf("status: got %q want active", gotStatus)
	}
}

// TestWebhook_AcceptsValidSignature_Updated_UpdatesEmail seeds a row
// then sends User.Data.Updated with a new email; the row's email must
// be updated. first_name/last_name are intentionally NOT touched by
// updates per the SQL contract.
func TestWebhook_AcceptsValidSignature_Updated_UpdatesEmail(t *testing.T) {
	f := newWebhookFixture(t, "test-key")

	logtoID := "logto_test_webhook_update"
	cleanupUser(t, f.pool, logtoID)

	// Seed a row with the OLD email.
	_, err := f.pool.Exec(context.Background(), `
		INSERT INTO users (email, first_name, last_name, date_of_birth, password_hash, logto_user_id, status, role)
		VALUES ('old@example.com', 'Bob', 'Builder', '2000-01-01', '', $1, 'active', 'player')
	`, logtoID)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}

	payload := map[string]interface{}{
		"event":  "User.Data.Updated",
		"userId": logtoID,
		"user": map[string]interface{}{
			"id":           logtoID,
			"primaryEmail": "new@example.com",
			"name":         "Bob Builder",
		},
	}
	body, _ := json.Marshal(payload)
	sig := signWebhook(f.signingKey, body)

	resp := f.postWebhook(t, body, sig)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}

	var gotEmail *string
	err = f.pool.QueryRow(context.Background(),
		`SELECT email FROM users WHERE logto_user_id = $1`, logtoID).Scan(&gotEmail)
	if err != nil {
		t.Fatalf("query updated user: %v", err)
	}
	if gotEmail == nil || *gotEmail != "new@example.com" {
		t.Errorf("email after update: got %v want new@example.com", gotEmail)
	}
}

// TestWebhook_UserDeleted_SoftDeletes seeds a row, sends User.Deleted,
// and verifies deleted_at is set (status is intentionally NOT changed
// because the legacy CHECK constraint forbids 'deleted' as a status
// value -- soft-delete is conveyed by deleted_at IS NOT NULL).
func TestWebhook_UserDeleted_SoftDeletes(t *testing.T) {
	f := newWebhookFixture(t, "test-key")

	logtoID := "logto_test_webhook_delete"
	cleanupUser(t, f.pool, logtoID)

	_, err := f.pool.Exec(context.Background(), `
		INSERT INTO users (email, first_name, last_name, date_of_birth, password_hash, logto_user_id, status, role)
		VALUES ('todelete@example.com', 'Del', 'Eted', '2000-01-01', '', $1, 'active', 'player')
	`, logtoID)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}

	payload := map[string]interface{}{
		"event":  "User.Deleted",
		"userId": logtoID,
	}
	body, _ := json.Marshal(payload)
	sig := signWebhook(f.signingKey, body)

	resp := f.postWebhook(t, body, sig)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}

	// deleted_at should be non-NULL now. Use a raw query (not the
	// generated GetUserByLogtoUserID, which filters on deleted_at IS
	// NULL).
	var hasDeletedAt bool
	err = f.pool.QueryRow(context.Background(),
		`SELECT deleted_at IS NOT NULL FROM users WHERE logto_user_id = $1`,
		logtoID).Scan(&hasDeletedAt)
	if err != nil {
		t.Fatalf("query deleted user: %v", err)
	}
	if !hasDeletedAt {
		t.Errorf("expected deleted_at to be set after User.Deleted webhook")
	}
}

// TestWebhook_UnknownEvent_Returns204 verifies that an event type the
// handler doesn't recognize is acknowledged with 204 so Logto stops
// retrying. (Returning 4xx/5xx would cause Logto to back-off-and-retry
// forever for events we don't care about.)
func TestWebhook_UnknownEvent_Returns204(t *testing.T) {
	f := newWebhookFixture(t, "test-key")

	body := []byte(`{"event":"Anything.Else","userId":"x"}`)
	sig := signWebhook(f.signingKey, body)

	resp := f.postWebhook(t, body, sig)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204 for unknown event, got %d", resp.StatusCode)
	}
}

// TestWebhook_MissingSigningKey_Returns500 verifies the
// fail-closed-on-misconfiguration behavior: a handler constructed with
// an empty signing key returns 500 INTERNAL_ERROR rather than silently
// accepting unsigned requests. Catches a deployment where the env var
// was never set.
func TestWebhook_MissingSigningKey_Returns500(t *testing.T) {
	f := newWebhookFixture(t, "")

	body := []byte(`{"event":"User.Created","userId":"x","user":{"id":"x"}}`)
	resp := f.postWebhook(t, body, "anything")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", resp.StatusCode)
	}
}
