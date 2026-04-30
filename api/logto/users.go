package logto

import (
	"context"
	"net/http"
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
