package logto

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

// Application is the Logto Management API representation of a registered
// application (SPA, M2M, native, traditional). Field set is intentionally
// narrow: just the fields the seed script and Phase 4 M2M flow read or write.
type Application struct {
	ID                   string                 `json:"id"`
	Name                 string                 `json:"name"`
	Description          string                 `json:"description,omitempty"`
	Type                 string                 `json:"type"`
	Secret               string                 `json:"secret,omitempty"`
	OIDCClientMetadata   map[string]interface{} `json:"oidcClientMetadata,omitempty"`
	CustomClientMetadata map[string]interface{} `json:"customClientMetadata,omitempty"`
	IsAdmin              bool                   `json:"isAdmin,omitempty"`
	CreatedAt            int64                  `json:"createdAt,omitempty"`
}

// ApplicationType values accepted by the Logto Management API.
const (
	AppTypeSPA              = "SPA"
	AppTypeMachineToMachine = "MachineToMachine"
	AppTypeNative           = "Native"
	AppTypeTraditionalWeb   = "Traditional"
)

// CreateApplicationParams is the body for POST /api/applications.
type CreateApplicationParams struct {
	Name                 string                 `json:"name"`
	Type                 string                 `json:"type"`
	Description          string                 `json:"description,omitempty"`
	OIDCClientMetadata   map[string]interface{} `json:"oidcClientMetadata,omitempty"`
	CustomClientMetadata map[string]interface{} `json:"customClientMetadata,omitempty"`
}

// CreateApplication creates a new application and returns the created row
// (including the generated client secret for M2M apps). NOT idempotent --
// callers needing idempotency should use FindApplicationByName first.
func (c *Client) CreateApplication(ctx context.Context, p CreateApplicationParams) (*Application, error) {
	var a Application
	if err := c.doJSON(ctx, http.MethodPost, "/api/applications", p, &a); err != nil {
		return nil, err
	}
	return &a, nil
}

// ListApplications returns up to pageSize applications. Logto's pagination
// uses page (1-based) + page_size; the seeder pages through with size=100
// to find existing apps by name.
func (c *Client) ListApplications(ctx context.Context, page, pageSize int) ([]Application, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	q := url.Values{}
	q.Set("page", strconv.Itoa(page))
	q.Set("page_size", strconv.Itoa(pageSize))

	var apps []Application
	path := "/api/applications?" + q.Encode()
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &apps); err != nil {
		return nil, err
	}
	return apps, nil
}

// FindApplicationByName scans the application list for an exact name match
// and returns the first hit, or nil if absent. Idempotent companion to
// CreateApplication for the seed flow.
func (c *Client) FindApplicationByName(ctx context.Context, name string) (*Application, error) {
	const pageSize = 100
	for page := 1; page <= 100; page++ { // hard cap: 10k apps
		apps, err := c.ListApplications(ctx, page, pageSize)
		if err != nil {
			return nil, err
		}
		for i := range apps {
			if apps[i].Name == name {
				return &apps[i], nil
			}
		}
		if len(apps) < pageSize {
			return nil, nil
		}
	}
	return nil, fmt.Errorf("more than 10k applications; FindApplicationByName paging budget exhausted")
}

// PatchApplicationParams is the body for PATCH /api/applications/:id. All
// fields are optional; only non-nil fields are sent so a partial update never
// clobbers metadata the caller didn't intend to touch. CustomClientMetadata
// is a full replacement of that object on Logto's side, so callers that want
// to preserve existing keys must merge first (see seedSPAApp).
type PatchApplicationParams struct {
	CustomClientMetadata map[string]interface{} `json:"customClientMetadata,omitempty"`
}

// PatchApplication updates an existing application and returns the updated
// row. Used by the seeder to flip customClientMetadata.allowTokenExchange on
// the SPA app so the OAuth 2.0 Token Exchange impersonation flow is permitted
// for that client.
func (c *Client) PatchApplication(ctx context.Context, appID string, p PatchApplicationParams) (*Application, error) {
	var a Application
	if err := c.doJSON(ctx, http.MethodPatch, "/api/applications/"+appID, p, &a); err != nil {
		return nil, err
	}
	return &a, nil
}

// AssignApplicationRoles attaches Logto-platform roles (e.g. the built-in
// "Logto Management API access" role) to a Machine-to-Machine application.
// roleIDs come from ListRoles. Idempotent: Logto returns 422 on duplicate
// assignment which the caller can surface or ignore.
func (c *Client) AssignApplicationRoles(ctx context.Context, appID string, roleIDs []string) error {
	body := map[string]interface{}{"roleIds": roleIDs}
	path := fmt.Sprintf("/api/applications/%s/roles", appID)
	return c.doJSON(ctx, http.MethodPost, path, body, nil)
}

// Role is a Logto-platform role (NOT the same as organization roles, which
// live on the organization template). Roles control what Logto Management
// API surface a holder can call.
type Role struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Type        string `json:"type,omitempty"`
}

// ListRoles returns all Logto-platform roles. Used by the seeder to find
// the built-in "Logto Management API access" role by name.
func (c *Client) ListRoles(ctx context.Context) ([]Role, error) {
	var roles []Role
	if err := c.doJSON(ctx, http.MethodGet, "/api/roles?page_size=100", nil, &roles); err != nil {
		return nil, err
	}
	return roles, nil
}

// FindRoleByName scans roles for an exact name match.
func (c *Client) FindRoleByName(ctx context.Context, name string) (*Role, error) {
	roles, err := c.ListRoles(ctx)
	if err != nil {
		return nil, err
	}
	for i := range roles {
		if roles[i].Name == name {
			return &roles[i], nil
		}
	}
	return nil, nil
}

// CreateRoleParams is the body for POST /api/roles.
type CreateRoleParams struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	// Type is "User" or "MachineToMachine". The seeder creates User-type
	// roles for the bootstrap admin's API resource scopes.
	Type string `json:"type,omitempty"`
}

// CreateRole creates a new Logto-platform role.
func (c *Client) CreateRole(ctx context.Context, p CreateRoleParams) (*Role, error) {
	var r Role
	if err := c.doJSON(ctx, http.MethodPost, "/api/roles", p, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

// AssignScopesToRole binds a set of API resource scopes to a role.
// scopeIDs come from ListResourceScopes(resourceID). Idempotent: Logto
// rejects already-bound scopes; the seeder catches the 422 and ignores it.
func (c *Client) AssignScopesToRole(ctx context.Context, roleID string, scopeIDs []string) error {
	body := map[string]interface{}{"scopeIds": scopeIDs}
	path := fmt.Sprintf("/api/roles/%s/scopes", roleID)
	return c.doJSON(ctx, http.MethodPost, path, body, nil)
}

// ListRoleScopes returns the API resource scopes bound to a role.
func (c *Client) ListRoleScopes(ctx context.Context, roleID string) ([]Scope, error) {
	var scopes []Scope
	path := fmt.Sprintf("/api/roles/%s/scopes?page_size=100", roleID)
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &scopes); err != nil {
		return nil, err
	}
	return scopes, nil
}

// AssignRolesToUser grants Logto-platform roles to a user. Idempotent on
// Logto's side; 422 on duplicate is the expected response.
func (c *Client) AssignRolesToUser(ctx context.Context, userID string, roleIDs []string) error {
	body := map[string]interface{}{"roleIds": roleIDs}
	path := fmt.Sprintf("/api/users/%s/roles", userID)
	return c.doJSON(ctx, http.MethodPost, path, body, nil)
}

// ListUserRoles returns the Logto-platform roles assigned to a user.
func (c *Client) ListUserRoles(ctx context.Context, userID string) ([]Role, error) {
	var roles []Role
	path := fmt.Sprintf("/api/users/%s/roles?page_size=100", userID)
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &roles); err != nil {
		return nil, err
	}
	return roles, nil
}
