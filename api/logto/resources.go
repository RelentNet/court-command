package logto

import (
	"context"
	"fmt"
	"net/http"
)

// Resource is a Logto API resource (the "Court Command API" resource that
// JWTs are issued for). Permissions on a resource are called "scopes" in
// the Logto UI; the API endpoint is /api/resources/:id/scopes.
type Resource struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Indicator   string `json:"indicator"`
	IsDefault   bool   `json:"isDefault,omitempty"`
	AccessTokenTTL int  `json:"accessTokenTtl,omitempty"`
}

// CreateResourceParams is the body for POST /api/resources.
type CreateResourceParams struct {
	Name      string `json:"name"`
	Indicator string `json:"indicator"`
}

// CreateResource registers a new API resource. The indicator (audience) is
// what JWTs will carry in their `aud` claim and is what api/auth.Validator
// matches against.
func (c *Client) CreateResource(ctx context.Context, p CreateResourceParams) (*Resource, error) {
	var r Resource
	if err := c.doJSON(ctx, http.MethodPost, "/api/resources", p, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

// ListResources returns all API resources. Logto returns the built-in
// management-api resource alongside user-created ones.
func (c *Client) ListResources(ctx context.Context) ([]Resource, error) {
	var rs []Resource
	if err := c.doJSON(ctx, http.MethodGet, "/api/resources?page_size=100", nil, &rs); err != nil {
		return nil, err
	}
	return rs, nil
}

// FindResourceByIndicator scans resources for an exact indicator match.
// Idempotent companion to CreateResource.
func (c *Client) FindResourceByIndicator(ctx context.Context, indicator string) (*Resource, error) {
	rs, err := c.ListResources(ctx)
	if err != nil {
		return nil, err
	}
	for i := range rs {
		if rs[i].Indicator == indicator {
			return &rs[i], nil
		}
	}
	return nil, nil
}

// Scope is a permission attached to a resource. Maps to the JWT `scope` claim.
type Scope struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	ResourceID  string `json:"resourceId,omitempty"`
}

// CreateResourceScope adds a single scope to a resource. Idempotent
// callers should use ListResourceScopes first.
func (c *Client) CreateResourceScope(ctx context.Context, resourceID, name, description string) (*Scope, error) {
	body := map[string]interface{}{"name": name, "description": description}
	var s Scope
	path := fmt.Sprintf("/api/resources/%s/scopes", resourceID)
	if err := c.doJSON(ctx, http.MethodPost, path, body, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// ListResourceScopes returns the scopes registered on a resource.
func (c *Client) ListResourceScopes(ctx context.Context, resourceID string) ([]Scope, error) {
	var scopes []Scope
	path := fmt.Sprintf("/api/resources/%s/scopes?page_size=200", resourceID)
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &scopes); err != nil {
		return nil, err
	}
	return scopes, nil
}
