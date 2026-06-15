// Package logto live smoke test against the real Logto deployment.
// Skipped unless LOGTO_LIVE_SMOKE=1 is set so it never runs in CI / regular dev.
package logto

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestLiveSmoke_GetUser exercises the client end-to-end against the real
// Logto deployment configured via LOGTO_* env vars (.env). Useful as a
// one-shot integration check that token caching, audience handling, and
// error paths all match the real server's behavior.
func TestLiveSmoke_GetUser(t *testing.T) {
	if os.Getenv("LOGTO_LIVE_SMOKE") != "1" {
		t.Skip("set LOGTO_LIVE_SMOKE=1 to run live smoke against Logto")
	}
	cfg := Config{
		Endpoint:               os.Getenv("LOGTO_ENDPOINT"),
		ManagementAPIAppID:     os.Getenv("LOGTO_MANAGEMENT_API_APP_ID"),
		ManagementAPIAppSecret: os.Getenv("LOGTO_MANAGEMENT_API_APP_SECRET"),
		ManagementAPIResource:  os.Getenv("LOGTO_MANAGEMENT_API_RESOURCE"),
	}
	require.NotEmpty(t, cfg.Endpoint, "LOGTO_ENDPOINT must be set")
	require.NotEmpty(t, cfg.ManagementAPIAppID, "LOGTO_MANAGEMENT_API_APP_ID must be set")
	require.NotEmpty(t, cfg.ManagementAPIAppSecret, "LOGTO_MANAGEMENT_API_APP_SECRET must be set")
	require.NotEmpty(t, cfg.ManagementAPIResource, "LOGTO_MANAGEMENT_API_RESOURCE must be set")

	c := NewClient(cfg)
	ctx := context.Background()

	// 1. Token mints
	tok, err := c.GetManagementToken(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, tok)

	// 2. Token caches (second call should be the same string)
	tok2, err := c.GetManagementToken(ctx)
	require.NoError(t, err)
	require.Equal(t, tok, tok2)

	// 3. Bootstrap admin lookup (user created in Step 6 of LOGTO_SETUP.md)
	bootstrapID := os.Getenv("LOGTO_BOOTSTRAP_USER_ID")
	if bootstrapID == "" {
		t.Skip("LOGTO_BOOTSTRAP_USER_ID not set; skipping user lookup")
	}
	user, err := c.GetUser(ctx, bootstrapID)
	require.NoError(t, err)
	require.Equal(t, bootstrapID, user.ID)
	require.NotEmpty(t, user.PrimaryEmail)
	t.Logf("bootstrap user resolved: id=%s email=%s name=%s",
		user.ID, user.PrimaryEmail, user.Name)

	// 4. 404 path
	_, err = c.GetUser(ctx, "nonexistent_user_id_xyz")
	require.Error(t, err)
	var apiErr *APIError
	require.True(t, errors.As(err, &apiErr), "want *APIError, got %T", err)
	require.Equal(t, 404, apiErr.Status)
}
