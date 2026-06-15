// api/service/user_sync.go
//
// UserSyncService is the central upsert path that keeps the local
// users table in sync with Logto. Two callers fan in here:
//
//   1. handler.LogtoWebhookHandler -- eventual sync on User.Created /
//      User.Data.Updated / User.Deleted webhook events from Logto.
//   2. middleware.MirrorUser -- immediate on-demand sync the very
//      first time a JWT subject reaches a /me/* protected route
//      (closes the gap between webhook delay and first request).
//
// Both paths converge on UpsertFromLogto so the insert/update logic
// lives in exactly one place.
package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/court-command/court-command/db/generated"
	"github.com/jackc/pgx/v5"
)

// UserSyncService owns the local users-table mirror of Logto's user
// directory. All methods are idempotent.
type UserSyncService struct {
	queries *generated.Queries
}

// NewUserSyncService binds a service to the given sqlc Queries handle.
func NewUserSyncService(q *generated.Queries) *UserSyncService {
	return &UserSyncService{queries: q}
}

// LogtoUserUpsert is the input shape for UpsertFromLogto. Callers
// (webhook + middleware) construct this from either the Logto webhook
// payload or a Logto Management API GetUser response.
type LogtoUserUpsert struct {
	LogtoUserID string
	Email       string
	FirstName   string
	LastName    string
	DisplayName string
}

// UpsertFromLogto inserts or updates the local users mirror for the
// given Logto identity. The function is idempotent: an existing row is
// updated in place; a missing row is inserted. Callers can invoke it
// repeatedly without worrying about duplicates.
//
// Lookup uses GetUserByLogtoUserID, which takes *string because of the
// nullable column type; we take a local of the LogtoUserID string and
// pass its address rather than &in.LogtoUserID to keep the parameter
// pointer unambiguously local to this call.
func (s *UserSyncService) UpsertFromLogto(ctx context.Context, in LogtoUserUpsert) error {
	sub := in.LogtoUserID
	existing, err := s.queries.GetUserByLogtoUserID(ctx, &sub)
	if err == nil {
		// Update path: the row exists, refresh email + display_name.
		// We deliberately do NOT touch first_name / last_name here --
		// the user owns those after creation; if Logto pushes a name
		// change we surface it via display_name only.
		display := in.DisplayName
		_, err := s.queries.UpdateUserFromLogto(ctx, generated.UpdateUserFromLogtoParams{
			ID:          existing.ID,
			Email:       in.Email,
			DisplayName: &display,
		})
		if err != nil {
			return fmt.Errorf("update user: %w", err)
		}
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("lookup user: %w", err)
	}
	// Insert path: no local row yet, create one. The query supplies
	// the password_hash sentinel, status='active', role='player', and
	// date_of_birth='1900-01-01' (see api/db/queries/users.sql).
	_, err = s.queries.CreateUserFromLogto(ctx, generated.CreateUserFromLogtoParams{
		LogtoUserID: in.LogtoUserID,
		Email:       in.Email,
		FirstName:   in.FirstName,
		LastName:    in.LastName,
	})
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

// SoftDelete marks the local users row corresponding to the given
// Logto user ID as soft-deleted (sets deleted_at). The row is left in
// place so referential integrity from tournaments.created_by, etc. is
// preserved. Returns nil for a no-op delete (already soft-deleted or
// never mirrored).
//
// SoftDeleteUserByLogtoUserID takes a non-pointer string in the
// generated signature (the @logto_user_id::TEXT cast in the SQL forces
// non-null), so we pass logtoUserID directly.
func (s *UserSyncService) SoftDelete(ctx context.Context, logtoUserID string) error {
	if err := s.queries.SoftDeleteUserByLogtoUserID(ctx, logtoUserID); err != nil {
		return fmt.Errorf("soft delete: %w", err)
	}
	return nil
}
