package auth

import (
	"testing"

	"github.com/lestrrat-go/jwx/v3/jwt"
	"github.com/stretchr/testify/require"
)

// TestExtractClaims verifies that ExtractClaims pulls all Logto-shaped claims
// (sub, aud, organization_id, organization_roles, scope) off a parsed jwx token
// into the normalized Claims struct.
func TestExtractClaims(t *testing.T) {
	tok := jwt.New()
	require.NoError(t, tok.Set(jwt.SubjectKey, "user_abc123"))
	require.NoError(t, tok.Set(jwt.AudienceKey, []string{"urn:logto:organization:org_pickleball"}))
	require.NoError(t, tok.Set("organization_id", "org_pickleball"))
	require.NoError(t, tok.Set("organization_roles", []string{"platform_admin", "player"}))
	require.NoError(t, tok.Set("scope", "read:tournaments write:tournaments read:admin write:admin"))

	c := ExtractClaims(tok)

	require.Equal(t, "user_abc123", c.Subject)
	require.Equal(t, "org_pickleball", c.OrganizationID)
	require.ElementsMatch(t, []string{"platform_admin", "player"}, c.OrganizationRoles)
	require.ElementsMatch(t,
		[]string{"read:tournaments", "write:tournaments", "read:admin", "write:admin"},
		c.Scopes,
	)
	require.Equal(t, []string{"urn:logto:organization:org_pickleball"}, c.Audience)

	require.True(t, c.HasScope("read:tournaments"))
	require.False(t, c.HasScope("delete:tournaments"))
	require.True(t, c.HasOrgRole("platform_admin"))
	require.False(t, c.HasOrgRole("guest"))
}

// TestExtractClaims_NoOrg covers a token without organization claims (e.g. a
// global resource token): OrganizationID and OrganizationRoles must be empty,
// Scopes must contain the single requested scope.
func TestExtractClaims_NoOrg(t *testing.T) {
	tok := jwt.New()
	require.NoError(t, tok.Set(jwt.SubjectKey, "user_xyz"))
	require.NoError(t, tok.Set("scope", "read:profile"))

	c := ExtractClaims(tok)

	require.Equal(t, "user_xyz", c.Subject)
	require.Empty(t, c.OrganizationID)
	require.Empty(t, c.OrganizationRoles)
	require.Equal(t, []string{"read:profile"}, c.Scopes)
	require.False(t, c.HasOrgRole("platform_admin"))
	require.True(t, c.HasScope("read:profile"))
}
