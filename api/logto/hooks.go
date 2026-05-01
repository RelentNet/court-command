package logto

import (
	"context"
	"net/http"
)

// Hook is a Logto webhook subscription. Events fire HTTP POST requests
// signed with the hook's signingKey (HMAC-SHA256, header
// `logto-signature-sha-256`).
type Hook struct {
	ID         string                 `json:"id"`
	Name       string                 `json:"name"`
	Events     []string               `json:"events"`
	Config     map[string]interface{} `json:"config"`
	SigningKey string                 `json:"signingKey,omitempty"`
	Enabled    bool                   `json:"enabled"`
}

// CreateHookParams is the body for POST /api/hooks.
type CreateHookParams struct {
	Name    string                 `json:"name"`
	Events  []string               `json:"events"`
	Config  map[string]interface{} `json:"config"`
	Enabled bool                   `json:"enabled"`
}

// CreateHook registers a new webhook subscription.
func (c *Client) CreateHook(ctx context.Context, p CreateHookParams) (*Hook, error) {
	var h Hook
	if err := c.doJSON(ctx, http.MethodPost, "/api/hooks", p, &h); err != nil {
		return nil, err
	}
	return &h, nil
}

// ListHooks returns all webhook subscriptions on the tenant.
func (c *Client) ListHooks(ctx context.Context) ([]Hook, error) {
	var hooks []Hook
	if err := c.doJSON(ctx, http.MethodGet, "/api/hooks?page_size=100", nil, &hooks); err != nil {
		return nil, err
	}
	return hooks, nil
}

// FindHookByName returns the first hook with the given name, or nil.
func (c *Client) FindHookByName(ctx context.Context, name string) (*Hook, error) {
	hooks, err := c.ListHooks(ctx)
	if err != nil {
		return nil, err
	}
	for i := range hooks {
		if hooks[i].Name == name {
			return &hooks[i], nil
		}
	}
	return nil, nil
}
