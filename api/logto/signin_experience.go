// Logto sign-in experience configuration. Each Logto tenant has exactly
// one sign-in-experience row controlling which identifier types (email,
// username, phone) are accepted, whether sign-up creates new accounts,
// what the password policy is, etc. The Mgmt API surface is:
//
//   GET   /api/sign-in-exp   -- read current config
//   PATCH /api/sign-in-exp   -- partial update; merged into existing row
//
// The seeder uses PATCH to enable email-as-identifier (default Logto
// install is username-only, which prevents the bootstrap admin from
// signing in with the email the seeder created them with).

package logto

import (
	"context"
	"net/http"
)

// SignInIdentifier is one of "username", "email", "phone".
type SignInIdentifier string

const (
	SignInIdentifierUsername SignInIdentifier = "username"
	SignInIdentifierEmail    SignInIdentifier = "email"
	SignInIdentifierPhone    SignInIdentifier = "phone"
)

// SignInMethod describes how a single identifier type is verified.
// For password-based flows, set Password=true and IsPasswordPrimary=true.
type SignInMethod struct {
	Identifier        SignInIdentifier `json:"identifier"`
	Password          bool             `json:"password"`
	VerificationCode  bool             `json:"verificationCode"`
	IsPasswordPrimary bool             `json:"isPasswordPrimary"`
}

// SignInConfig is the {methods: [...]} block under sign_in.
type SignInConfig struct {
	Methods []SignInMethod `json:"methods"`
}

// SignUpConfig controls whether new accounts can self-register and
// which identifier(s) the registration form requires.
type SignUpConfig struct {
	// Identifiers is a list of identifier types users must supply at sign-up.
	// e.g. ["email"] requires email, ["username"] requires username.
	Identifiers []SignInIdentifier `json:"identifiers"`
	// Password controls whether a password is collected at sign-up.
	Password bool `json:"password"`
	// Verify controls whether the identifier (e.g. email link) is verified.
	Verify bool `json:"verify"`
}

// UpdateSignInExperienceParams is the body for PATCH /api/sign-in-exp.
// All fields are optional; nil leaves the corresponding section unchanged.
// Note JSON tags use the snake_case Logto wire format.
type UpdateSignInExperienceParams struct {
	SignIn *SignInConfig `json:"signIn,omitempty"`
	SignUp *SignUpConfig `json:"signUp,omitempty"`
}

// UpdateSignInExperience patches the tenant's sign-in experience config.
// Default Logto install enables only password+username; this endpoint is
// how the seeder switches to email-as-identifier so the bootstrap admin
// (created with primaryEmail and no username) can actually sign in.
//
// IMPORTANT: enabling an email-based identifier requires an email
// connector to exist in the tenant first; otherwise Logto rejects the
// request with sign_in_experiences.enabled_connector_not_found. Use
// CreateConnector with the mock-email-service connector_id for dev.
func (c *Client) UpdateSignInExperience(ctx context.Context, p UpdateSignInExperienceParams) error {
	return c.doJSON(ctx, http.MethodPatch, "/api/sign-in-exp", p, nil)
}

// Connector is a Logto-registered authentication connector instance
// (one row in the connectors table). Each connector wraps a connector
// factory (identified by ConnectorID, e.g. "mock-email-service") with
// tenant-specific config.
type Connector struct {
	ID          string                 `json:"id"`
	ConnectorID string                 `json:"connectorId"`
	SyncProfile bool                   `json:"syncProfile"`
	Config      map[string]interface{} `json:"config,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

// CreateConnectorParams is the body for POST /api/connectors.
type CreateConnectorParams struct {
	ConnectorID string                 `json:"connectorId"`
	Config      map[string]interface{} `json:"config,omitempty"`
}

// CreateConnector registers a connector instance for the tenant. For
// example, ConnectorID="mock-email-service" registers the mock email
// connector bundled with Logto for integration testing.
func (c *Client) CreateConnector(ctx context.Context, p CreateConnectorParams) (*Connector, error) {
	var out Connector
	if err := c.doJSON(ctx, http.MethodPost, "/api/connectors", p, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ListConnectors returns all registered connector instances for the tenant.
func (c *Client) ListConnectors(ctx context.Context) ([]Connector, error) {
	var connectors []Connector
	if err := c.doJSON(ctx, http.MethodGet, "/api/connectors", nil, &connectors); err != nil {
		return nil, err
	}
	return connectors, nil
}
