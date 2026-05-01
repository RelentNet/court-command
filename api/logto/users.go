package logto

import (
	"context"
	"errors"
	"net/http"
	"net/url"
)

// LogtoUser is the subset of the Logto user record Court Command consumes.
// Field names match Logto's JSON shape verbatim. CustomData is left as a
// generic map because each subsystem (auth_me, webhooks) reads different
// keys; typed parsing happens at the call site.
type LogtoUser struct {
	ID           string                 `json:"id"`
	Username     string                 `json:"username,omitempty"`
	PrimaryEmail string                 `json:"primaryEmail,omitempty"`
	Name         string                 `json:"name,omitempty"`
	Avatar       string                 `json:"avatar,omitempty"`
	CustomData   map[string]interface{} `json:"customData,omitempty"`
	IsSuspended  bool                   `json:"isSuspended,omitempty"`
	CreatedAt    int64                  `json:"createdAt,omitempty"`
	UpdatedAt    int64                  `json:"updatedAt,omitempty"`
}

// GetUser fetches a single user by Logto user ID. Non-2xx responses are
// returned as *APIError; callers branching on "user not found" should
// errors.As to (*APIError) and check Status == 404.
func (c *Client) GetUser(ctx context.Context, userID string) (*LogtoUser, error) {
	var u LogtoUser
	if err := c.doJSON(ctx, http.MethodGet, "/api/users/"+userID, nil, &u); err != nil {
		return nil, err
	}
	return &u, nil
}

// CreateUserParams is the body for POST /api/users.
type CreateUserParams struct {
	PrimaryEmail string `json:"primaryEmail,omitempty"`
	Username     string `json:"username,omitempty"`
	Password     string `json:"password,omitempty"`
	Name         string `json:"name,omitempty"`
}

// CreateUser creates a Logto user (used by the seeder for the bootstrap
// admin and by Phase 4 for tournament staff). The password is plaintext
// here only because Logto needs to hash it server-side; it must never
// be persisted on Court Command's side.
func (c *Client) CreateUser(ctx context.Context, p CreateUserParams) (*LogtoUser, error) {
	var u LogtoUser
	if err := c.doJSON(ctx, http.MethodPost, "/api/users", p, &u); err != nil {
		return nil, err
	}
	return &u, nil
}

// FindUserByEmail returns the first user whose primaryEmail matches
// exactly, or nil if no such user. Idempotent companion to CreateUser
// for the seeder.
func (c *Client) FindUserByEmail(ctx context.Context, email string) (*LogtoUser, error) {
	q := url.Values{}
	q.Set("search.primaryEmail", email)
	q.Set("mode.primaryEmail", "exact")
	q.Set("page_size", "10")

	var users []LogtoUser
	path := "/api/users?" + q.Encode()
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &users); err != nil {
		// Some Logto versions don't support search.primaryEmail; fall back
		// to a broader scan if that's the case.
		var apiErr *APIError
		if errors.As(err, &apiErr) && apiErr.Status == 400 {
			return c.findUserByEmailFallback(ctx, email)
		}
		return nil, err
	}
	for i := range users {
		if users[i].PrimaryEmail == email {
			return &users[i], nil
		}
	}
	return nil, nil
}

// findUserByEmailFallback scans all users when search.primaryEmail isn't
// honored (older Logto versions). Caps at 1000 users; the seeder targets
// dev environments so this is fine.
func (c *Client) findUserByEmailFallback(ctx context.Context, email string) (*LogtoUser, error) {
	const pageSize = 100
	for page := 1; page <= 10; page++ {
		q := url.Values{}
		q.Set("page", "1")
		q.Set("page_size", "100")
		var users []LogtoUser
		if err := c.doJSON(ctx, http.MethodGet, "/api/users?"+q.Encode(), nil, &users); err != nil {
			return nil, err
		}
		for i := range users {
			if users[i].PrimaryEmail == email {
				return &users[i], nil
			}
		}
		if len(users) < pageSize {
			return nil, nil
		}
	}
	return nil, nil
}
