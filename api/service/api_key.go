// api/service/api_key.go
package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/court-command/court-command/db/generated"
)

// ApiKeyService handles API key business logic.
type ApiKeyService struct {
	queries *generated.Queries
}

// NewApiKeyService creates a new ApiKeyService.
func NewApiKeyService(queries *generated.Queries) *ApiKeyService {
	return &ApiKeyService{queries: queries}
}

// ApiKeyResponse is the public representation of an API key (never includes the full key).
type ApiKeyResponse struct {
	ID         int64    `json:"id"`
	Name       string   `json:"name"`
	KeyPrefix  string   `json:"key_prefix"`
	Scopes     []string `json:"scopes"`
	ExpiresAt  *string  `json:"expires_at,omitempty"`
	LastUsedAt *string  `json:"last_used_at,omitempty"`
	IsActive   bool     `json:"is_active"`
	CreatedAt  string   `json:"created_at"`
}

// ApiKeyCreateResponse is returned when a new key is created — includes the full raw key exactly once.
type ApiKeyCreateResponse struct {
	ApiKeyResponse
	RawKey string `json:"raw_key"`
}

// toApiKeyResponse converts a generated ApiKey to a response DTO.
func toApiKeyResponse(k generated.ApiKey) ApiKeyResponse {
	resp := ApiKeyResponse{
		ID:        k.ID,
		Name:      k.Name,
		KeyPrefix: k.KeyPrefix,
		Scopes:    k.Scopes,
		IsActive:  k.IsActive,
		CreatedAt: k.CreatedAt.Format(time.RFC3339),
	}
	if k.ExpiresAt.Valid {
		t := k.ExpiresAt.Time.Format(time.RFC3339)
		resp.ExpiresAt = &t
	}
	if k.LastUsedAt.Valid {
		t := k.LastUsedAt.Time.Format(time.RFC3339)
		resp.LastUsedAt = &t
	}
	return resp
}

// CreateApiKey generates a new API key for the given user.
// expiresAt, if non-nil, is the absolute UTC time the key expires.
func (s *ApiKeyService) CreateApiKey(ctx context.Context, userID int64, name string, scopes []string, expiresAt *time.Time) (*ApiKeyCreateResponse, error) {
	if name == "" {
		return nil, NewValidation("name is required")
	}

	// Limit active keys per user
	count, err := s.queries.CountApiKeysByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("counting api keys: %w", err)
	}
	if count >= 10 {
		return nil, NewValidation("maximum of 10 active API keys per user")
	}

	// Generate a 32-byte random key
	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		return nil, fmt.Errorf("generating random key: %w", err)
	}
	rawKey := "ccapi_" + hex.EncodeToString(rawBytes)
	prefix := rawKey[:14] // "ccapi_" + 8 hex chars

	// Hash the key for storage
	hash := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(hash[:])

	var expiresAtPg pgtype.Timestamptz
	if expiresAt != nil {
		if expiresAt.Before(time.Now()) {
			return nil, NewValidation("expires_at must be in the future")
		}
		expiresAtPg = pgtype.Timestamptz{Time: *expiresAt, Valid: true}
	}

	if scopes == nil {
		scopes = []string{"read"}
	}

	apiKey, err := s.queries.CreateApiKey(ctx, generated.CreateApiKeyParams{
		UserID:    userID,
		Name:      name,
		KeyHash:   keyHash,
		KeyPrefix: prefix,
		Scopes:    scopes,
		ExpiresAt: expiresAtPg,
	})
	if err != nil {
		return nil, fmt.Errorf("creating api key: %w", err)
	}

	return &ApiKeyCreateResponse{
		ApiKeyResponse: toApiKeyResponse(apiKey),
		RawKey:         rawKey,
	}, nil
}

// ListApiKeys returns all API keys for a given user.
func (s *ApiKeyService) ListApiKeys(ctx context.Context, userID int64) ([]ApiKeyResponse, error) {
	keys, err := s.queries.ListApiKeysByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("listing api keys: %w", err)
	}

	result := make([]ApiKeyResponse, len(keys))
	for i, k := range keys {
		result[i] = toApiKeyResponse(k)
	}
	return result, nil
}

// RevokeApiKey deactivates an API key by ID, verifying ownership.
func (s *ApiKeyService) RevokeApiKey(ctx context.Context, keyID, userID int64) error {
	return s.queries.DeactivateApiKey(ctx, generated.DeactivateApiKeyParams{
		ID:     keyID,
		UserID: userID,
	})
}

// ValidateApiKey checks a raw API key against the database.
// Returns the API key row if valid, or an error.
func (s *ApiKeyService) ValidateApiKey(ctx context.Context, rawKey string) (*generated.ApiKey, error) {
	hash := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(hash[:])

	apiKey, err := s.queries.GetApiKeyByHash(ctx, keyHash)
	if err != nil {
		return nil, NewNotFound("invalid API key")
	}

	// Check expiration
	if apiKey.ExpiresAt.Valid && time.Now().After(apiKey.ExpiresAt.Time) {
		return nil, NewValidation("API key has expired")
	}

	// Reject keys belonging to non-active or soft-deleted users. The key's
	// own is_active flag is checked in the query (GetApiKeyByHash), but a
	// suspend/ban only wipes the user's sessions -- it does NOT deactivate
	// their API keys -- so without this check a banned/suspended user keeps
	// a working authenticated identity through any key created before the
	// ban. Mirrors the status gate the password Login path enforces.
	user, err := s.queries.GetUserByID(ctx, apiKey.UserID)
	if err != nil {
		return nil, NewNotFound("invalid API key")
	}
	if user.DeletedAt.Valid {
		return nil, NewNotFound("invalid API key")
	}
	if user.Status != "active" {
		return nil, NewValidationf("account is %s", user.Status)
	}

	// Update last used (fire and forget)
	_ = s.queries.UpdateApiKeyLastUsed(ctx, apiKey.ID)

	return &apiKey, nil
}
