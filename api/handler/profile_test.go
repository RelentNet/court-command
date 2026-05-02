// api/handler/profile_test.go
//
// These tests exercise ProfileHandler's GetMyProfile and PatchMyProfile
// directly against a real Postgres-backed ProfileService. They do NOT
// go through the chi router or the RequireJWT middleware -- instead each
// request is built with auth.WithClaims(...) on its context, which is
// exactly what RequireJWT sets after a successful token validation.
// This keeps the tests focused on handler+service+SQL behaviour and
// avoids having to spin up an httptest JWKS server just to mint tokens
// the validator will accept. Token validation itself is covered by
// api/middleware/jwt_middleware_test.go (Phase 1).
//
// Each test seeds its own user row directly and uses that user's
// logto_user_id as the JWT subject. ProfileService.LookupUserByLogtoSubject
// resolves it back to users.id the same way it would in production.
package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/handler"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/testutil"

	"github.com/jackc/pgx/v5/pgxpool"
)

// seedUserWithLogtoID inserts a users row with the given logto_user_id
// and returns the new local users.id. The row uses the writer-friendly
// minimal column set required by the table (NOT NULL columns + a
// nonempty password_hash sentinel that mirrors how the Logto webhook
// will populate webhook-created users in Task 9).
func seedUserWithLogtoID(t *testing.T, pool *pgxpool.Pool, email, logtoUserID string) int64 {
	t.Helper()
	var id int64
	// users.date_of_birth is NOT NULL on the legacy schema (Phase 6 will
	// move it to player_profiles and drop the column); we set a fixed
	// stub date so the seed satisfies the constraint without polluting
	// the test's actual DOB assertions which target player_profiles.
	err := pool.QueryRow(context.Background(), `
		INSERT INTO users (email, first_name, last_name, date_of_birth, password_hash, logto_user_id, status, role)
		VALUES ($1, 'Test', 'User', '2000-01-01', '', $2, 'active', 'player')
		RETURNING id`, email, logtoUserID).Scan(&id)
	if err != nil {
		t.Fatalf("seed user (%s): %v", email, err)
	}
	t.Cleanup(func() {
		// Use hard-delete here for test isolation -- soft-delete (deleted_at)
		// would break GetUserByLogtoUserID for any reused logto_user_id in
		// later test runs. CASCADE drops the player_profiles row too.
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id)
	})
	return id
}

// newProfileHandler builds a ProfileHandler with a real, db-backed
// ProfileService against the given pool. It deliberately doesn't go
// through testutil.TestServer because we want to invoke handler methods
// directly with hand-crafted contexts.
func newProfileHandler(pool *pgxpool.Pool) *handler.ProfileHandler {
	q := generated.New(pool)
	return handler.NewProfileHandler(service.NewProfileService(q))
}

// reqWithClaims builds an httptest request with the given claims pre-set
// on its context, mimicking what RequireJWT does after token validation.
func reqWithClaims(method, path, body string, claims auth.Claims) *http.Request {
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
	}
	return r.WithContext(auth.WithClaims(r.Context(), claims))
}

// TestGetMyProfile_NoRowReturnsEmpty verifies the contract that a user
// with no player_profiles row yet still gets a 200 with an empty DTO
// (just user_id populated). The frontend form depends on this so it can
// render in "create" mode without having to handle a 404.
func TestGetMyProfile_NoRowReturnsEmpty(t *testing.T) {
	pool := testutil.TestDB(t)
	h := newProfileHandler(pool)

	logtoID := "logto_test_no_row"
	userID := seedUserWithLogtoID(t, pool, "no-row@test.com", logtoID)

	req := reqWithClaims(http.MethodGet, "/api/v1/me/profile", "",
		auth.Claims{Subject: logtoID, Scopes: []string{"read:profile"}})
	rec := httptest.NewRecorder()
	h.GetMyProfile(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var got service.PlayerProfileDTO
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v body=%s", err, rec.Body.String())
	}
	if got.UserID != userID {
		t.Errorf("user_id: got %d want %d", got.UserID, userID)
	}
	if got.Phone != nil || got.Bio != nil || got.AddressLine1 != nil {
		t.Errorf("expected empty profile fields for fresh user, got %+v", got)
	}
	if got.IsProfileHidden != false {
		t.Errorf("is_profile_hidden default: got %v want false", got.IsProfileHidden)
	}
}

// TestGetMyProfile_ExistingRow inserts a profile row directly via SQL
// then confirms the handler returns the same fields.
func TestGetMyProfile_ExistingRow(t *testing.T) {
	pool := testutil.TestDB(t)
	h := newProfileHandler(pool)

	logtoID := "logto_test_existing"
	userID := seedUserWithLogtoID(t, pool, "existing@test.com", logtoID)

	_, err := pool.Exec(context.Background(), `
		INSERT INTO player_profiles (user_id, phone, bio, address_line_1, is_profile_hidden)
		VALUES ($1, '+15555550100', 'I like pickleball', '123 Main St', true)`, userID)
	if err != nil {
		t.Fatalf("seed profile: %v", err)
	}

	req := reqWithClaims(http.MethodGet, "/api/v1/me/profile", "",
		auth.Claims{Subject: logtoID, Scopes: []string{"read:profile"}})
	rec := httptest.NewRecorder()
	h.GetMyProfile(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var got service.PlayerProfileDTO
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Phone == nil || *got.Phone != "+15555550100" {
		t.Errorf("phone: got %v", got.Phone)
	}
	if got.Bio == nil || *got.Bio != "I like pickleball" {
		t.Errorf("bio: got %v", got.Bio)
	}
	if got.AddressLine1 == nil || *got.AddressLine1 != "123 Main St" {
		t.Errorf("address_line_1: got %v", got.AddressLine1)
	}
	if !got.IsProfileHidden {
		t.Errorf("is_profile_hidden: got false want true")
	}
}

// TestPatchMyProfile_RequiresWriteScope verifies that a token without
// the write:profile scope is rejected with 403, even when the user is
// otherwise valid. This is the scope check that lets us issue
// minimal-scope tokens to read-only clients.
func TestPatchMyProfile_RequiresWriteScope(t *testing.T) {
	pool := testutil.TestDB(t)
	h := newProfileHandler(pool)

	logtoID := "logto_test_no_scope"
	_ = seedUserWithLogtoID(t, pool, "no-scope@test.com", logtoID)

	body := `{"bio": "should not save"}`
	req := reqWithClaims(http.MethodPatch, "/api/v1/me/profile", body,
		auth.Claims{Subject: logtoID, Scopes: []string{"read:profile"}}) // no write
	rec := httptest.NewRecorder()
	h.PatchMyProfile(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "write:profile") {
		t.Errorf("expected error message mentioning write:profile, got %s", rec.Body.String())
	}
}

// TestPatchMyProfile_PartialUpdate_LeavesOtherFieldsAlone is the COALESCE
// contract test: we seed a row with phone set, PATCH only the bio, then
// GET and confirm phone is still there. Without the narg COALESCE
// pattern the upsert would null phone out.
func TestPatchMyProfile_PartialUpdate_LeavesOtherFieldsAlone(t *testing.T) {
	pool := testutil.TestDB(t)
	h := newProfileHandler(pool)

	logtoID := "logto_test_partial"
	userID := seedUserWithLogtoID(t, pool, "partial@test.com", logtoID)

	_, err := pool.Exec(context.Background(), `
		INSERT INTO player_profiles (user_id, phone, paddle_brand)
		VALUES ($1, '+15555550200', 'Selkirk')`, userID)
	if err != nil {
		t.Fatalf("seed profile: %v", err)
	}

	// PATCH only bio. Note we explicitly do NOT send phone/paddle_brand.
	body := `{"bio": "Updated bio"}`
	req := reqWithClaims(http.MethodPatch, "/api/v1/me/profile", body,
		auth.Claims{Subject: logtoID, Scopes: []string{"write:profile"}})
	rec := httptest.NewRecorder()
	h.PatchMyProfile(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var got service.PlayerProfileDTO
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Bio == nil || *got.Bio != "Updated bio" {
		t.Errorf("bio: got %v want 'Updated bio'", got.Bio)
	}
	if got.Phone == nil || *got.Phone != "+15555550200" {
		t.Errorf("phone preserved? got %v want '+15555550200'", got.Phone)
	}
	if got.PaddleBrand == nil || *got.PaddleBrand != "Selkirk" {
		t.Errorf("paddle_brand preserved? got %v want 'Selkirk'", got.PaddleBrand)
	}
	_ = userID
}

// TestPatchMyProfile_DateOfBirth_Roundtrip exercises the YYYY-MM-DD
// pgtype.Date conversion path on both the inbound (DTO->params) and
// outbound (row->DTO) sides. A bug in either translation would surface
// here as a mismatched string or a 400.
func TestPatchMyProfile_DateOfBirth_Roundtrip(t *testing.T) {
	pool := testutil.TestDB(t)
	h := newProfileHandler(pool)

	logtoID := "logto_test_dob"
	_ = seedUserWithLogtoID(t, pool, "dob@test.com", logtoID)

	body := `{"date_of_birth": "1990-01-15"}`
	req := reqWithClaims(http.MethodPatch, "/api/v1/me/profile", body,
		auth.Claims{Subject: logtoID, Scopes: []string{"write:profile"}})
	rec := httptest.NewRecorder()
	h.PatchMyProfile(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("PATCH expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// GET it back and confirm round-trip.
	getReq := reqWithClaims(http.MethodGet, "/api/v1/me/profile", "",
		auth.Claims{Subject: logtoID, Scopes: []string{"read:profile"}})
	getRec := httptest.NewRecorder()
	h.GetMyProfile(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET expected 200, got %d: %s", getRec.Code, getRec.Body.String())
	}
	var got service.PlayerProfileDTO
	if err := json.Unmarshal(getRec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.DateOfBirth == nil {
		t.Fatalf("date_of_birth was nil after round-trip; body=%s", getRec.Body.String())
	}
	if *got.DateOfBirth != "1990-01-15" {
		t.Errorf("date_of_birth: got %q want %q", *got.DateOfBirth, "1990-01-15")
	}
}
