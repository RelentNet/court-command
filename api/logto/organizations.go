package logto

import (
	"context"
	"fmt"
	"net/http"
)

// Organization represents a Logto organization. Court Command uses one org
// per sport (Pickleball, Demo Sport).
type Organization struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	CustomData  map[string]interface{} `json:"customData,omitempty"`
	CreatedAt   int64                  `json:"createdAt,omitempty"`
}

// CreateOrganization creates a new Logto organization. Use FindOrgByName
// first if you need idempotent semantics.
func (c *Client) CreateOrganization(ctx context.Context, name, description string) (*Organization, error) {
	body := map[string]interface{}{"name": name}
	if description != "" {
		body["description"] = description
	}
	var o Organization
	if err := c.doJSON(ctx, http.MethodPost, "/api/organizations", body, &o); err != nil {
		return nil, err
	}
	return &o, nil
}

// ListOrganizations returns all organizations on the tenant.
func (c *Client) ListOrganizations(ctx context.Context) ([]Organization, error) {
	var orgs []Organization
	if err := c.doJSON(ctx, http.MethodGet, "/api/organizations?page_size=100", nil, &orgs); err != nil {
		return nil, err
	}
	return orgs, nil
}

// FindOrgByName returns the first organization matching name exactly, or nil.
func (c *Client) FindOrgByName(ctx context.Context, name string) (*Organization, error) {
	orgs, err := c.ListOrganizations(ctx)
	if err != nil {
		return nil, err
	}
	for i := range orgs {
		if orgs[i].Name == name {
			return &orgs[i], nil
		}
	}
	return nil, nil
}

// AddUserToOrganization adds a user to a Logto organization. Idempotent:
// Logto's POST /organizations/:id/users responds 201 on first add and
// 200/204 on subsequent calls (current behavior; if Logto starts returning
// 422 on duplicates, callers should errors.As for *APIError and ignore 422).
func (c *Client) AddUserToOrganization(ctx context.Context, orgID, userID string) error {
	body := map[string]interface{}{"userIds": []string{userID}}
	path := fmt.Sprintf("/api/organizations/%s/users", orgID)
	return c.doJSON(ctx, http.MethodPost, path, body, nil)
}

// AssignOrganizationRolesToUser binds the given organization roles to the
// user's membership in an org. roleNames are the human-readable names
// (e.g. "platform_admin") -- Logto's API actually wants role IDs, so the
// caller must resolve names to IDs via ListOrganizationRoles first. The
// seeder uses this directly with already-resolved IDs.
func (c *Client) AssignOrganizationRolesToUser(ctx context.Context, orgID, userID string, roleIDs []string) error {
	body := map[string]interface{}{"organizationRoleIds": roleIDs}
	path := fmt.Sprintf("/api/organizations/%s/users/%s/roles", orgID, userID)
	return c.doJSON(ctx, http.MethodPost, path, body, nil)
}

// OrganizationRole is a role on the organization template (e.g.
// platform_admin, tournament_director). Distinct from Logto-platform roles
// which gate Management API access.
type OrganizationRole struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Type        string `json:"type,omitempty"`
}

// ListOrganizationRoles returns all roles defined on the organization
// template. Roles are shared across every organization.
func (c *Client) ListOrganizationRoles(ctx context.Context) ([]OrganizationRole, error) {
	var roles []OrganizationRole
	if err := c.doJSON(ctx, http.MethodGet, "/api/organization-roles?page_size=100", nil, &roles); err != nil {
		return nil, err
	}
	return roles, nil
}

// CreateOrganizationRole adds a new role to the organization template.
func (c *Client) CreateOrganizationRole(ctx context.Context, name, description string) (*OrganizationRole, error) {
	body := map[string]interface{}{"name": name}
	if description != "" {
		body["description"] = description
	}
	var r OrganizationRole
	if err := c.doJSON(ctx, http.MethodPost, "/api/organization-roles", body, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

// OrganizationScope is a permission on the organization template.
type OrganizationScope struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// ListOrganizationScopes returns all org scopes on the template.
func (c *Client) ListOrganizationScopes(ctx context.Context) ([]OrganizationScope, error) {
	var scopes []OrganizationScope
	if err := c.doJSON(ctx, http.MethodGet, "/api/organization-scopes?page_size=100", nil, &scopes); err != nil {
		return nil, err
	}
	return scopes, nil
}

// CreateOrganizationScope adds a new scope to the organization template.
func (c *Client) CreateOrganizationScope(ctx context.Context, name, description string) (*OrganizationScope, error) {
	body := map[string]interface{}{"name": name}
	if description != "" {
		body["description"] = description
	}
	var s OrganizationScope
	if err := c.doJSON(ctx, http.MethodPost, "/api/organization-scopes", body, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// AssignScopesToOrgRole adds organization scopes to an organization role.
// Both arguments are Logto IDs (not human names). Idempotent: re-adding
// existing scopes is a no-op on most Logto versions.
func (c *Client) AssignScopesToOrgRole(ctx context.Context, roleID string, scopeIDs []string) error {
	body := map[string]interface{}{"organizationScopeIds": scopeIDs}
	path := fmt.Sprintf("/api/organization-roles/%s/scopes", roleID)
	return c.doJSON(ctx, http.MethodPost, path, body, nil)
}

// ListOrgRoleScopes returns the scopes currently bound to an org role.
func (c *Client) ListOrgRoleScopes(ctx context.Context, roleID string) ([]OrganizationScope, error) {
	var scopes []OrganizationScope
	path := fmt.Sprintf("/api/organization-roles/%s/scopes?page_size=100", roleID)
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &scopes); err != nil {
		return nil, err
	}
	return scopes, nil
}
