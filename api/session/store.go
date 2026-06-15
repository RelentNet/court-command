// api/session/store.go
package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	// SessionTTL is the lifetime of a session.
	SessionTTL = 30 * 24 * time.Hour // 30 days

	// SessionPrefix is the Redis key prefix for sessions.
	SessionPrefix = "session:"

	// SessionCookieName is the name of the session cookie.
	SessionCookieName = "cc_session"
)

// Data holds the session payload stored in Redis.
type Data struct {
	UserID    int64  `json:"user_id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	PublicID  string `json:"public_id"`
	CreatedAt int64  `json:"created_at"`

	// Impersonation fields — LEGACY cookie-path only. Set by the deprecated
	// AdminHandler.StartImpersonation cookie flow, which is no longer mounted
	// (impersonation now runs via Logto OAuth 2.0 Token Exchange on the JWT
	// path — the act claim carries the impersonator, not these fields).
	// Retained only because the cookie session store + legacy cookie Me
	// handler still reference them in the testutil-only path.
	// TODO(phase-6): delete these fields together with the cookie session
	// store, the legacy Me handler, and AdminHandler.StartImpersonation.
	ImpersonatorID       int64  `json:"impersonator_id,omitempty"`
	ImpersonatorPublicID string `json:"impersonator_public_id,omitempty"`
	ImpersonatorToken    string `json:"impersonator_token,omitempty"`
}

// IsImpersonating returns true if this session is an impersonation session.
func (d *Data) IsImpersonating() bool {
	return d.ImpersonatorID > 0
}

// Store manages sessions in Redis.
type Store struct {
	client *redis.Client
}

// NewStore creates a new session store backed by Redis.
func NewStore(redisURL string) (*Store, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parsing redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("pinging redis: %w", err)
	}

	return &Store{client: client}, nil
}

// Create generates a new session token, stores session data in Redis, and returns the token.
func (s *Store) Create(ctx context.Context, data *Data) (string, error) {
	token, err := generateToken()
	if err != nil {
		return "", fmt.Errorf("generating session token: %w", err)
	}

	data.CreatedAt = time.Now().Unix()

	payload, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("marshaling session data: %w", err)
	}

	key := SessionPrefix + token
	if err := s.client.Set(ctx, key, payload, SessionTTL).Err(); err != nil {
		return "", fmt.Errorf("storing session: %w", err)
	}

	return token, nil
}

// Get retrieves session data by token. Returns nil if the session does not exist or has expired.
func (s *Store) Get(ctx context.Context, token string) (*Data, error) {
	key := SessionPrefix + token

	payload, err := s.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil // Session not found or expired
	}
	if err != nil {
		return nil, fmt.Errorf("getting session: %w", err)
	}

	var data Data
	if err := json.Unmarshal(payload, &data); err != nil {
		return nil, fmt.Errorf("unmarshaling session data: %w", err)
	}

	return &data, nil
}

// Delete removes a session by token (logout).
func (s *Store) Delete(ctx context.Context, token string) error {
	key := SessionPrefix + token
	if err := s.client.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("deleting session: %w", err)
	}
	return nil
}

// DeleteAllForUser removes all sessions for a given user ID.
// Used for suspend/ban flows where we need instant session revocation.
func (s *Store) DeleteAllForUser(ctx context.Context, userID int64) error {
	var cursor uint64
	for {
		keys, nextCursor, err := s.client.Scan(ctx, cursor, SessionPrefix+"*", 100).Result()
		if err != nil {
			return fmt.Errorf("scanning sessions: %w", err)
		}

		for _, key := range keys {
			payload, err := s.client.Get(ctx, key).Bytes()
			if err != nil {
				continue
			}
			var data Data
			if err := json.Unmarshal(payload, &data); err != nil {
				continue
			}
			if data.UserID == userID {
				s.client.Del(ctx, key)
			}
		}

		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	return nil
}

// Close closes the Redis client connection.
func (s *Store) Close() error {
	return s.client.Close()
}

// Client returns the underlying Redis client for use by other subsystems.
func (s *Store) Client() *redis.Client {
	return s.client
}

// generateToken creates a cryptographically random 32-byte hex token.
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
