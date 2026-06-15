// Package logtoseed provisions a Logto tenant with everything Court
// Command needs: SPA app, API resource + scopes, M2M role assignment,
// org template (roles + scopes), Pickleball + Demo Sport orgs,
// bootstrap admin with platform_admin in those orgs, the webhook,
// the email connector, the sign-in experience, and a User-type role
// bound to all 12 API scopes assigned to the bootstrap admin. After
// provisioning Logto it syncs sports.logto_org_id in the application
// database to the IDs Logto just generated.
//
// Run is idempotent: every create call is preceded by a find call, so
// invoking it on an already-seeded tenant is safe and (modulo a few
// HTTP round trips) cheap. The api invokes Run on every boot so a
// fresh deploy comes up fully configured without any operator action.
// The api/cmd/logto-seed binary is kept as a CLI fallback for
// debugging or emergencies.
package logtoseed

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config is everything Run needs to provision a Logto tenant. All
// values are passed in -- callers (api/main.go and the CLI) decide
// how to source them. LoadConfigFromEnv is provided as the canonical
// way to populate this from the standard env vars.
type Config struct {
	// Logto Management API connectivity. Required.
	Endpoint        string // LOGTO_ENDPOINT, e.g. https://logto.courtcommand.app
	MgmtAppID       string // LOGTO_MANAGEMENT_API_APP_ID
	MgmtAppSecret   string // LOGTO_MANAGEMENT_API_APP_SECRET
	MgmtAPIResource string // LOGTO_MANAGEMENT_API_RESOURCE; defaults to https://default.logto.app/api

	// What we're provisioning.
	APIResourceIndicator string // LOGTO_API_RESOURCE; the audience the SPA's tokens target
	SPARedirectURI       string // LOGTO_SPA_REDIRECT_URI
	WebhookURL           string // LOGTO_WEBHOOK_URL; where Logto POSTs user.* events

	// Bootstrap admin. The seeder ensures this user exists in Logto and
	// has platform_admin in every sport org.
	BootstrapEmail    string // LOGTO_BOOTSTRAP_EMAIL
	BootstrapPassword string // LOGTO_BOOTSTRAP_PASSWORD; only used when creating the user
	BootstrapName     string // LOGTO_BOOTSTRAP_NAME

	// Drift-protection inputs. When non-empty the seeder treats the env
	// value as authoritative and refuses to silently regenerate -- this
	// prevents the api from booting against a Logto where someone deleted
	// the SPA app or webhook (which would otherwise cause the seeder to
	// create a new one with a new ID/key, leaving baked-in build args
	// or env stale and the production stack broken).
	//
	// Empty means "no expectation; create or adopt whatever Logto returns
	// from find-by-name". This is the first-boot path on a brand-new
	// tenant.
	ExpectedSPAAppID         string // LOGTO_SPA_APP_ID (== VITE_LOGTO_APP_ID baked into web)
	ExpectedWebhookSigningKey string // LOGTO_WEBHOOK_SIGNING_KEY (== api's webhook HMAC env)

	// SeedDemoSport controls whether Demo Sport is created. Defaults to
	// true in dev (APP_ENV != "production") and false in production.
	// Override with SEED_DEMO_SPORT=true|false.
	SeedDemoSport bool

	// SMTP. When all four are set, the seeder registers the SMTP
	// connector (real-email path). When empty, registers an http-email
	// discard connector (local-dev path; emails go nowhere).
	SMTPHost      string
	SMTPPort      int
	SMTPUser      string
	SMTPPass      string
	EmailFrom     string
	EmailFromName string

	// EmailVerifyOnSignUp gates whether sign-up requires an email-code
	// verification step. Forced false when SMTP is unconfigured (otherwise
	// every sign-up would 500 at code-send time).
	EmailVerifyOnSignUp bool
}

// SMTPConfigured reports whether all SMTP fields needed to register a
// real SMTP connector are present.
func (c *Config) SMTPConfigured() bool {
	return c.SMTPHost != "" && c.SMTPPort > 0 && c.SMTPUser != "" && c.SMTPPass != "" && c.EmailFrom != ""
}

// LoadConfigFromEnv reads every Config field from environment variables,
// applying the same defaults as the original CLI. Returns an error if
// any required variable is missing -- callers in production should
// fail-fast on this; dev callers may choose to skip Run entirely.
func LoadConfigFromEnv() (*Config, error) {
	cfg := &Config{
		Endpoint:                  strings.TrimRight(os.Getenv("LOGTO_ENDPOINT"), "/"),
		MgmtAppID:                 os.Getenv("LOGTO_MANAGEMENT_API_APP_ID"),
		MgmtAppSecret:             os.Getenv("LOGTO_MANAGEMENT_API_APP_SECRET"),
		MgmtAPIResource:           envOrDefault("LOGTO_MANAGEMENT_API_RESOURCE", "https://default.logto.app/api"),
		APIResourceIndicator:      envOrDefault("LOGTO_API_RESOURCE", "http://localhost:8080/api"),
		SPARedirectURI:            envOrDefault("LOGTO_SPA_REDIRECT_URI", "http://localhost:5173/auth/callback"),
		WebhookURL:                envOrDefault("LOGTO_WEBHOOK_URL", "http://host.docker.internal:8080/api/v1/webhooks/logto"),
		BootstrapEmail:            envOrDefault("LOGTO_BOOTSTRAP_EMAIL", "admin@courtcommand.local"),
		BootstrapPassword:         envOrDefault("LOGTO_BOOTSTRAP_PASSWORD", "TestPass123!"),
		BootstrapName:             envOrDefault("LOGTO_BOOTSTRAP_NAME", "Local Admin"),
		ExpectedSPAAppID:          os.Getenv("LOGTO_SPA_APP_ID"),
		ExpectedWebhookSigningKey: os.Getenv("LOGTO_WEBHOOK_SIGNING_KEY"),
		SeedDemoSport:             seedDemoSportFromEnv(),
		SMTPHost:                  os.Getenv("SMTP_HOST"),
		SMTPPort:                  smtpPortFromEnv(),
		SMTPUser:                  os.Getenv("SMTP_USER"),
		SMTPPass:                  os.Getenv("SMTP_PASS"),
		EmailFrom:                 os.Getenv("EMAIL_FROM"),
		EmailFromName:             envOrDefault("EMAIL_FROM_NAME", "Court Command"),
		EmailVerifyOnSignUp:       emailVerifyOnSignUpFromEnv(),
	}
	var missing []string
	if cfg.Endpoint == "" {
		missing = append(missing, "LOGTO_ENDPOINT")
	}
	if cfg.MgmtAppID == "" {
		missing = append(missing, "LOGTO_MANAGEMENT_API_APP_ID")
	}
	if cfg.MgmtAppSecret == "" {
		missing = append(missing, "LOGTO_MANAGEMENT_API_APP_SECRET")
	}
	if len(missing) > 0 {
		// Phrased to be useful both to a developer running the CLI and
		// to an operator looking at api boot logs.
		return nil, fmt.Errorf("missing required env vars: %s\n\nFirst-run setup: open the Logto admin UI, create the\ninitial admin account, then create a Machine-to-Machine application\nnamed %q assigned the %q role. Copy its App ID and App Secret into\nLOGTO_MANAGEMENT_API_APP_ID/SECRET (Coolify env or .env), then redeploy.",
			strings.Join(missing, ", "), M2MAppName, MgmtAPIRoleName)
	}
	return cfg, nil
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// seedDemoSportFromEnv: explicit SEED_DEMO_SPORT wins; otherwise default
// depends on APP_ENV. Production defaults to false (single-sport launch);
// any other env (including "" / "development") seeds both.
func seedDemoSportFromEnv() bool {
	if v := os.Getenv("SEED_DEMO_SPORT"); v != "" {
		return strings.EqualFold(v, "true") || v == "1"
	}
	return os.Getenv("APP_ENV") != "production"
}

// smtpPortFromEnv parses SMTP_PORT, defaulting to 465 (TLS) which works
// for Resend, AWS SES, and most providers. Returns 0 only when SMTP_PORT
// is set to garbage and even then we log + use 465 -- 0 would otherwise
// cause SMTPConfigured() to return false silently.
func smtpPortFromEnv() int {
	v := os.Getenv("SMTP_PORT")
	if v == "" {
		return 465
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		// Not using slog here so this stays usable from the CLI's plain
		// log output; the api wraps stdout in slog anyway.
		fmt.Fprintf(os.Stderr, "warning: SMTP_PORT=%q is not numeric; using 465\n", v)
		return 465
	}
	return n
}

// emailVerifyOnSignUpFromEnv reports whether sign-up should require an
// email-verification code. Explicit EMAIL_VERIFY_ON_SIGNUP=true|false
// wins; otherwise defaults to true (email verification is industry
// standard). Run() forces this to false when SMTP isn't configured.
func emailVerifyOnSignUpFromEnv() bool {
	if v := os.Getenv("EMAIL_VERIFY_ON_SIGNUP"); v != "" {
		return strings.EqualFold(v, "true") || v == "1"
	}
	return true
}
