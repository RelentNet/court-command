// Command logto-seed idempotently provisions a Logto tenant with everything
// Court Command needs: SPA app, Court Command API resource + scopes, M2M app
// role assignment, organization template (roles + scopes + role-scope
// mappings), Pickleball + Demo Sport organizations, bootstrap admin user
// with platform_admin role in both orgs, the Court Command webhook, the
// sign-in experience configured for email-based sign-in, and a Logto
// User-type role bound to all 12 API scopes assigned to the bootstrap admin.
//
// If DATABASE_URL is set, the seeder also connects to the Court Command
// application Postgres database and syncs sports.logto_org_id to the IDs
// of the orgs it just created in Logto. Without this sync, X-Sport
// header lookups in the backend cannot resolve to the local Logto org
// IDs and every sport-scoped request will 403.
//
// Designed to mirror what was done by hand in production (per
// docs/LOGTO_SETUP.md). Running this script against an already-seeded
// tenant is a no-op: every create call is preceded by a find call, and
// existing items are reused.
//
// Reads configuration from the api/cmd/logto-seed environment:
//   LOGTO_ENDPOINT                  required (e.g. http://localhost:3001)
//   LOGTO_MANAGEMENT_API_APP_ID     required (operator-created via admin UI)
//   LOGTO_MANAGEMENT_API_APP_SECRET required (operator-created via admin UI)
//   LOGTO_MANAGEMENT_API_RESOURCE   defaults to https://default.logto.app/api
//   LOGTO_API_RESOURCE              defaults to http://localhost:8080/api
//   LOGTO_SPA_REDIRECT_URI          defaults to http://localhost:5173/auth/callback
//   LOGTO_WEBHOOK_URL               defaults to http://host.docker.internal:8080/api/v1/webhooks/logto
//   LOGTO_BOOTSTRAP_EMAIL           defaults to admin@courtcommand.local
//   LOGTO_BOOTSTRAP_PASSWORD        defaults to TestPass123! (DO NOT use in prod)
//   LOGTO_BOOTSTRAP_NAME            defaults to "Local Admin"
//   DATABASE_URL                    optional; if set, syncs sports.logto_org_id
//
// Usage:
//   go run ./cmd/logto-seed
// or:
//   make logto-seed
//
// On success, prints a summary including the SPA app ID, sport org IDs,
// webhook signing key, and bootstrap admin credentials. Capture these into
// .env before starting the backend.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/court-command/court-command/logto"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	spaAppName            = "Court Command Web"
	m2mAppName            = "Court Command Backend"
	apiResourceName       = "Court Command API"
	mgmtAPIRoleName       = "Logto Management API access"
	pickleballOrgName     = "Pickleball"
	demoSportOrgName      = "Demo Sport"
	pickleballOrgDesc     = "Production sport on Court Command"
	demoSportOrgDesc      = "Test organization that exercises the multi-sport plumbing"
	courtCommandHookName  = "Court Command Backend"
	platformAdminRoleName = "platform_admin"

	// apiUserRoleName is a Logto User-type role bound to all 12 API
	// resource scopes. Granted to the bootstrap admin so their access
	// tokens carry write:profile, manage_*, etc. Without it, the SPA
	// will receive a token with NO API scopes and every PATCH/POST
	// will 403 even though the user is "platform_admin" in their org.
	apiUserRoleName = "Court Command API (all scopes)"
)

// apiScopes are the 12 Court Command API scopes registered on the API
// resource. Order is intentional: read before write within each domain.
var apiScopes = []scopeDef{
	{"read:profile", "Read user profile data"},
	{"write:profile", "Update user profile data"},
	{"read:tournaments", "Read tournament data"},
	{"write:tournaments", "Create or update tournaments"},
	{"read:matches", "Read match data"},
	{"write:matches", "Create or update matches and scores"},
	{"read:registrations", "Read registration data"},
	{"write:registrations", "Create or update registrations"},
	{"read:overlay", "Read overlay configuration"},
	{"write:overlay", "Update overlay configuration"},
	{"read:admin", "Read admin-level data"},
	{"write:admin", "Perform admin-level actions"},
}

// orgScopes are the five organization-level scopes shared across roles.
var orgScopes = []scopeDef{
	{"manage_tournaments", "Create, update, archive tournaments in this sport"},
	{"manage_matches", "Score, edit, override matches in this sport"},
	{"manage_registrations", "Add, approve, withdraw registrations"},
	{"manage_users", "Manage user roles and statuses within this sport"},
	{"read_all", "Read all sport data (no write)"},
}

// orgRoles are the five organization roles defined on the template, with
// their scope assignments. Order matters: platform_admin is created last so
// the seeder can assign every other scope to it without hardcoding.
var orgRoles = []orgRoleDef{
	{Name: "player", Description: "Default role for users in this sport",
		Scopes: []string{"read_all"}},
	{Name: "tournament_director", Description: "Can manage tournaments in this sport",
		Scopes: []string{"read_all", "manage_tournaments", "manage_registrations"}},
	{Name: "referee", Description: "Can score matches in this sport",
		Scopes: []string{"read_all", "manage_matches"}},
	{Name: "scorekeeper", Description: "Same as referee, alternate label for staff naming",
		Scopes: []string{"read_all", "manage_matches"}},
	{Name: "platform_admin", Description: "Full platform access within this sport",
		Scopes: []string{"read_all", "manage_tournaments", "manage_matches", "manage_registrations", "manage_users"}},
}

// hookEvents are the webhook events the backend's webhook handler subscribes to.
var hookEvents = []string{"User.Created", "User.Data.Updated", "User.Deleted"}

type scopeDef struct {
	name, description string
}

type orgRoleDef struct {
	Name        string
	Description string
	Scopes      []string
}

type config struct {
	Endpoint              string
	MgmtAppID             string
	MgmtAppSecret         string
	MgmtAPIResource       string
	APIResourceIndicator  string
	SPARedirectURI        string
	WebhookURL            string
	BootstrapEmail        string
	BootstrapPassword     string
	BootstrapName         string
	// DatabaseURL is the Court Command application Postgres URL. If set,
	// the seeder also syncs sports.logto_org_id to the local Logto orgs.
	// If empty, that step is skipped with a warning -- the operator
	// must then patch sports.logto_org_id by hand.
	DatabaseURL string
	// SeedDemoSport controls whether the Demo Sport organization is
	// created. Defaults to true in dev (APP_ENV != "production") and
	// false in production. Override with SEED_DEMO_SPORT=true|false.
	// Demo Sport exists for E2E tests and to exercise the multi-sport
	// plumbing; at production launch only Pickleball is offered, so
	// the picker auto-redirects (VITE_AUTO_REDIRECT_SINGLE_SPORT) and
	// users never see a sport selection screen.
	SeedDemoSport bool
	// SMTPHost / SMTPPort / SMTPUser / SMTPPass configure the Logto
	// SMTP connector ("simple-mail-transfer-protocol"). When all four
	// are non-empty the seeder registers/updates an SMTP connector and
	// removes the dev http-email connector if present.
	//
	// When empty, the seeder falls back to the legacy http-email
	// discard connector (dev only -- emails go nowhere). This lets
	// `make logto-seed` keep working in local dev without any SMTP
	// credentials, while production sets RESEND_* envs (or any other
	// SMTP provider) to wire real email delivery.
	SMTPHost  string
	SMTPPort  int
	SMTPUser  string
	SMTPPass  string
	EmailFrom string
	EmailFromName string
	// EmailVerifyOnSignUp toggles sign-up email verification. Forced
	// false when SMTP isn't configured (otherwise sign-up would fail
	// on every code-send). Defaults to true when SMTP is configured.
	EmailVerifyOnSignUp bool
}

func loadConfig() (*config, error) {
	cfg := &config{
		Endpoint:             strings.TrimRight(os.Getenv("LOGTO_ENDPOINT"), "/"),
		MgmtAppID:            os.Getenv("LOGTO_MANAGEMENT_API_APP_ID"),
		MgmtAppSecret:        os.Getenv("LOGTO_MANAGEMENT_API_APP_SECRET"),
		MgmtAPIResource:      envOrDefault("LOGTO_MANAGEMENT_API_RESOURCE", "https://default.logto.app/api"),
		APIResourceIndicator: envOrDefault("LOGTO_API_RESOURCE", "http://localhost:8080/api"),
		SPARedirectURI:       envOrDefault("LOGTO_SPA_REDIRECT_URI", "http://localhost:5173/auth/callback"),
		WebhookURL:           envOrDefault("LOGTO_WEBHOOK_URL", "http://host.docker.internal:8080/api/v1/webhooks/logto"),
		BootstrapEmail:       envOrDefault("LOGTO_BOOTSTRAP_EMAIL", "admin@courtcommand.local"),
		BootstrapPassword:    envOrDefault("LOGTO_BOOTSTRAP_PASSWORD", "TestPass123!"),
		BootstrapName:        envOrDefault("LOGTO_BOOTSTRAP_NAME", "Local Admin"),
		DatabaseURL:          os.Getenv("DATABASE_URL"),
		SeedDemoSport:        seedDemoSportFromEnv(),
		SMTPHost:             os.Getenv("SMTP_HOST"),
		SMTPPort:             smtpPortFromEnv(),
		SMTPUser:             os.Getenv("SMTP_USER"),
		SMTPPass:             os.Getenv("SMTP_PASS"),
		EmailFrom:            os.Getenv("EMAIL_FROM"),
		EmailFromName:        envOrDefault("EMAIL_FROM_NAME", "Court Command"),
		EmailVerifyOnSignUp:  emailVerifyOnSignUpFromEnv(),
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
		return nil, fmt.Errorf("missing required env vars: %s\n\nFirst-run setup: open %s in a browser, create the\ninitial admin account, then create a Machine-to-Machine application\nnamed %q assigned the %q role. Copy its App ID and App Secret into\nyour .env, then re-run this script.",
			strings.Join(missing, ", "), strings.Replace(cfg.Endpoint, "3001", "3002", 1), m2mAppName, mgmtAPIRoleName)
	}
	return cfg, nil
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// seedDemoSportFromEnv reports whether the Demo Sport organization
// should be created. Explicit SEED_DEMO_SPORT=true|false wins; otherwise
// the default depends on APP_ENV: production seeds only Pickleball;
// any other env (including "" / "development") seeds both. This keeps
// E2E tests and local dev exercising the multi-sport plumbing while
// keeping the launch tenant clean.
func seedDemoSportFromEnv() bool {
	if v := os.Getenv("SEED_DEMO_SPORT"); v != "" {
		return strings.EqualFold(v, "true") || v == "1"
	}
	return os.Getenv("APP_ENV") != "production"
}

// smtpPortFromEnv parses SMTP_PORT, defaulting to 465 (TLS) which works
// for Resend, AWS SES, and most providers. Returns 0 when SMTP isn't
// configured at all (caller treats 0 as "use the http-email fallback").
func smtpPortFromEnv() int {
	v := os.Getenv("SMTP_PORT")
	if v == "" {
		return 465
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Printf("warning: SMTP_PORT=%q is not numeric; ignoring", v)
		return 465
	}
	return n
}

// emailVerifyOnSignUpFromEnv reports whether sign-up should require an
// email-verification code. Explicit EMAIL_VERIFY_ON_SIGNUP=true|false
// wins; otherwise defaults to true (email verification is industry
// standard). The seeder will FORCE this to false when SMTP isn't
// configured -- otherwise sign-up would fail on every attempt because
// Logto cannot deliver the verification code.
func emailVerifyOnSignUpFromEnv() bool {
	if v := os.Getenv("EMAIL_VERIFY_ON_SIGNUP"); v != "" {
		return strings.EqualFold(v, "true") || v == "1"
	}
	return true
}

// smtpConfigured reports whether all four SMTP env vars are set. The
// seeder uses this to decide between registering the SMTP connector
// (production path) and the legacy http-email discard connector
// (local-dev path).
func (c *config) smtpConfigured() bool {
	return c.SMTPHost != "" && c.SMTPPort > 0 && c.SMTPUser != "" && c.SMTPPass != "" && c.EmailFrom != ""
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	client := logto.NewClient(logto.Config{
		Endpoint:               cfg.Endpoint,
		ManagementAPIAppID:     cfg.MgmtAppID,
		ManagementAPIAppSecret: cfg.MgmtAppSecret,
		ManagementAPIResource:  cfg.MgmtAPIResource,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	log.Printf("Logto seed starting against %s", cfg.Endpoint)
	log.Printf("  M2M app ID: %s", cfg.MgmtAppID)
	if cfg.SeedDemoSport {
		log.Printf("  Demo Sport: enabled (SEED_DEMO_SPORT, APP_ENV=%q)", os.Getenv("APP_ENV"))
	} else {
		log.Printf("  Demo Sport: SKIPPED (production launch mode)")
	}

	// Sanity-check that the Management API token mints. Catches bad credentials
	// up front rather than partway through.
	if _, err := client.GetManagementToken(ctx); err != nil {
		log.Fatalf("Management API token request failed (check LOGTO_MANAGEMENT_API_APP_ID/SECRET): %v", err)
	}
	log.Printf("✓ Management API token ok")

	result := &seedResult{}

	if err := seedAPIResource(ctx, client, cfg, result); err != nil {
		log.Fatalf("API resource: %v", err)
	}
	if err := seedSPAApp(ctx, client, cfg, result); err != nil {
		log.Fatalf("SPA app: %v", err)
	}
	if err := assignManagementAPIRole(ctx, client, cfg, result); err != nil {
		log.Fatalf("M2M role assignment: %v", err)
	}
	if err := seedOrgScopes(ctx, client, result); err != nil {
		log.Fatalf("org scopes: %v", err)
	}
	if err := seedOrgRoles(ctx, client, result); err != nil {
		log.Fatalf("org roles: %v", err)
	}
	if err := seedOrganizations(ctx, client, cfg, result); err != nil {
		log.Fatalf("organizations: %v", err)
	}
	if err := seedBootstrapAdmin(ctx, client, cfg, result); err != nil {
		log.Fatalf("bootstrap admin: %v", err)
	}
	if err := seedAPIUserRole(ctx, client, cfg, result); err != nil {
		log.Fatalf("API user role: %v", err)
	}
	if err := seedEmailConnector(ctx, client, cfg); err != nil {
		log.Fatalf("email connector: %v", err)
	}
	if err := seedSignInExperience(ctx, client, cfg); err != nil {
		log.Fatalf("sign-in experience: %v", err)
	}
	if err := seedWebhook(ctx, client, cfg, result); err != nil {
		log.Fatalf("webhook: %v", err)
	}
	if err := syncSportsOrgIDs(ctx, cfg, result); err != nil {
		log.Fatalf("sync sports.logto_org_id: %v", err)
	}

	printSummary(cfg, result)
}

type seedResult struct {
	APIResourceID     string
	SPAAppID          string
	OrgScopeIDs       map[string]string // scope name -> ID
	OrgRoleIDs        map[string]string // role name -> ID
	PickleballOrgID   string
	DemoSportOrgID    string
	BootstrapUserID   string
	APIUserRoleID     string // Logto User-type role bound to all 12 API scopes
	WebhookSigningKey string
}

func seedAPIResource(ctx context.Context, c *logto.Client, cfg *config, r *seedResult) error {
	existing, err := c.FindResourceByIndicator(ctx, cfg.APIResourceIndicator)
	if err != nil {
		return err
	}
	var resID string
	if existing != nil {
		log.Printf("✓ API resource %q exists (id=%s)", cfg.APIResourceIndicator, existing.ID)
		resID = existing.ID
	} else {
		created, err := c.CreateResource(ctx, logto.CreateResourceParams{
			Name:      apiResourceName,
			Indicator: cfg.APIResourceIndicator,
		})
		if err != nil {
			return fmt.Errorf("create resource: %w", err)
		}
		log.Printf("✓ Created API resource %q (id=%s)", cfg.APIResourceIndicator, created.ID)
		resID = created.ID
	}
	r.APIResourceID = resID

	// Idempotent scope provisioning.
	have, err := c.ListResourceScopes(ctx, resID)
	if err != nil {
		return fmt.Errorf("list scopes: %w", err)
	}
	haveSet := make(map[string]bool, len(have))
	for _, s := range have {
		haveSet[s.Name] = true
	}

	added := 0
	for _, s := range apiScopes {
		if haveSet[s.name] {
			continue
		}
		if _, err := c.CreateResourceScope(ctx, resID, s.name, s.description); err != nil {
			return fmt.Errorf("create scope %q: %w", s.name, err)
		}
		added++
	}
	log.Printf("✓ API scopes: %d existing, %d added (target: %d)", len(have), added, len(apiScopes))
	return nil
}

func seedSPAApp(ctx context.Context, c *logto.Client, cfg *config, r *seedResult) error {
	existing, err := c.FindApplicationByName(ctx, spaAppName)
	if err != nil {
		return err
	}
	if existing != nil {
		log.Printf("✓ SPA app %q exists (id=%s)", spaAppName, existing.ID)
		r.SPAAppID = existing.ID
		return nil
	}
	created, err := c.CreateApplication(ctx, logto.CreateApplicationParams{
		Name:        spaAppName,
		Type:        logto.AppTypeSPA,
		Description: "Court Command web frontend (React SPA)",
		OIDCClientMetadata: map[string]interface{}{
			"redirectUris":          []string{cfg.SPARedirectURI},
			"postLogoutRedirectUris": []string{strings.TrimSuffix(cfg.SPARedirectURI, "/auth/callback")},
		},
	})
	if err != nil {
		return fmt.Errorf("create SPA app: %w", err)
	}
	log.Printf("✓ Created SPA app %q (id=%s)", spaAppName, created.ID)
	r.SPAAppID = created.ID
	return nil
}

func assignManagementAPIRole(ctx context.Context, c *logto.Client, cfg *config, r *seedResult) error {
	roles, err := c.ListRoles(ctx)
	if err != nil {
		return fmt.Errorf("list roles: %w", err)
	}
	var mgmtRoleID string
	for _, role := range roles {
		if role.Name == mgmtAPIRoleName {
			mgmtRoleID = role.ID
			break
		}
	}
	if mgmtRoleID == "" {
		return fmt.Errorf("built-in role %q not found in Logto -- cannot self-bootstrap M2M role assignment", mgmtAPIRoleName)
	}

	// Assigning is idempotent on Logto's side. We treat 422 (already assigned)
	// as a soft-success rather than an error.
	err = c.AssignApplicationRoles(ctx, cfg.MgmtAppID, []string{mgmtRoleID})
	if err != nil {
		var apiErr *logto.APIError
		if errors.As(err, &apiErr) && apiErr.Status == 422 {
			log.Printf("✓ M2M app already has %q role", mgmtAPIRoleName)
			return nil
		}
		return fmt.Errorf("assign role: %w", err)
	}
	log.Printf("✓ Assigned %q role to M2M app", mgmtAPIRoleName)
	return nil
}

func seedOrgScopes(ctx context.Context, c *logto.Client, r *seedResult) error {
	have, err := c.ListOrganizationScopes(ctx)
	if err != nil {
		return fmt.Errorf("list org scopes: %w", err)
	}
	r.OrgScopeIDs = make(map[string]string, len(have)+len(orgScopes))
	for _, s := range have {
		r.OrgScopeIDs[s.Name] = s.ID
	}
	added := 0
	for _, def := range orgScopes {
		if _, ok := r.OrgScopeIDs[def.name]; ok {
			continue
		}
		created, err := c.CreateOrganizationScope(ctx, def.name, def.description)
		if err != nil {
			return fmt.Errorf("create org scope %q: %w", def.name, err)
		}
		r.OrgScopeIDs[def.name] = created.ID
		added++
	}
	log.Printf("✓ Org scopes: %d existing, %d added", len(have), added)
	return nil
}

func seedOrgRoles(ctx context.Context, c *logto.Client, r *seedResult) error {
	have, err := c.ListOrganizationRoles(ctx)
	if err != nil {
		return fmt.Errorf("list org roles: %w", err)
	}
	r.OrgRoleIDs = make(map[string]string, len(have)+len(orgRoles))
	for _, role := range have {
		r.OrgRoleIDs[role.Name] = role.ID
	}

	added := 0
	for _, def := range orgRoles {
		roleID, ok := r.OrgRoleIDs[def.Name]
		if !ok {
			created, err := c.CreateOrganizationRole(ctx, def.Name, def.Description)
			if err != nil {
				return fmt.Errorf("create org role %q: %w", def.Name, err)
			}
			roleID = created.ID
			r.OrgRoleIDs[def.Name] = roleID
			added++
		}

		// Bind the role's declared scopes. ListOrgRoleScopes returns the
		// current bindings; only attach scopes that aren't already there.
		currentScopes, err := c.ListOrgRoleScopes(ctx, roleID)
		if err != nil {
			return fmt.Errorf("list scopes for role %q: %w", def.Name, err)
		}
		currentSet := make(map[string]bool, len(currentScopes))
		for _, s := range currentScopes {
			currentSet[s.Name] = true
		}
		var toAdd []string
		for _, scopeName := range def.Scopes {
			if currentSet[scopeName] {
				continue
			}
			scopeID, ok := r.OrgScopeIDs[scopeName]
			if !ok {
				return fmt.Errorf("role %q wants unknown scope %q", def.Name, scopeName)
			}
			toAdd = append(toAdd, scopeID)
		}
		if len(toAdd) > 0 {
			if err := c.AssignScopesToOrgRole(ctx, roleID, toAdd); err != nil {
				return fmt.Errorf("assign scopes to role %q: %w", def.Name, err)
			}
		}
	}
	log.Printf("✓ Org roles: %d existing, %d added (scope bindings synced)", len(have), added)
	return nil
}

func seedOrganizations(ctx context.Context, c *logto.Client, cfg *config, r *seedResult) error {
	specs := []struct {
		name, desc string
		idField    *string
	}{
		{pickleballOrgName, pickleballOrgDesc, &r.PickleballOrgID},
	}
	if cfg.SeedDemoSport {
		specs = append(specs, struct {
			name, desc string
			idField    *string
		}{demoSportOrgName, demoSportOrgDesc, &r.DemoSportOrgID})
	} else {
		// Idempotency for previously-seeded tenants: if Demo Sport
		// already exists from an earlier dev seed, capture its ID
		// (so syncSportsOrgIDs can still update the local row) but
		// don't create it. We never delete; flipping the flag back
		// on resumes the original behavior.
		existing, err := c.FindOrgByName(ctx, demoSportOrgName)
		if err == nil && existing != nil {
			log.Printf("✓ Demo Sport org exists from prior seed (id=%s); leaving in place", existing.ID)
			r.DemoSportOrgID = existing.ID
		}
	}
	for _, spec := range specs {
		existing, err := c.FindOrgByName(ctx, spec.name)
		if err != nil {
			return fmt.Errorf("find org %q: %w", spec.name, err)
		}
		if existing != nil {
			log.Printf("✓ Org %q exists (id=%s)", spec.name, existing.ID)
			*spec.idField = existing.ID
			continue
		}
		created, err := c.CreateOrganization(ctx, spec.name, spec.desc)
		if err != nil {
			return fmt.Errorf("create org %q: %w", spec.name, err)
		}
		log.Printf("✓ Created org %q (id=%s)", spec.name, created.ID)
		*spec.idField = created.ID
	}
	return nil
}

func seedBootstrapAdmin(ctx context.Context, c *logto.Client, cfg *config, r *seedResult) error {
	user, err := c.FindUserByEmail(ctx, cfg.BootstrapEmail)
	if err != nil {
		return fmt.Errorf("find user: %w", err)
	}
	if user != nil {
		log.Printf("✓ Bootstrap admin %q exists (id=%s)", cfg.BootstrapEmail, user.ID)
		r.BootstrapUserID = user.ID
	} else {
		created, err := c.CreateUser(ctx, logto.CreateUserParams{
			PrimaryEmail: cfg.BootstrapEmail,
			Password:     cfg.BootstrapPassword,
			Name:         cfg.BootstrapName,
		})
		if err != nil {
			return fmt.Errorf("create user: %w", err)
		}
		log.Printf("✓ Created bootstrap admin %q (id=%s)", cfg.BootstrapEmail, created.ID)
		r.BootstrapUserID = created.ID
	}

	platformAdminRoleID, ok := r.OrgRoleIDs[platformAdminRoleName]
	if !ok {
		return fmt.Errorf("internal error: %q role ID not resolved", platformAdminRoleName)
	}

	// Build the list of orgs to grant platform_admin in. Skip Demo
	// Sport when it wasn't seeded (production launch mode); the
	// admin can be re-granted later if Demo Sport is added.
	var orgIDs []string
	if r.PickleballOrgID != "" {
		orgIDs = append(orgIDs, r.PickleballOrgID)
	}
	if r.DemoSportOrgID != "" {
		orgIDs = append(orgIDs, r.DemoSportOrgID)
	}
	for _, orgID := range orgIDs {
		if err := c.AddUserToOrganization(ctx, orgID, r.BootstrapUserID); err != nil {
			var apiErr *logto.APIError
			// 422 = already a member; 200/201 = newly added. Treat both as success.
			if !(errors.As(err, &apiErr) && apiErr.Status == 422) {
				return fmt.Errorf("add user to org %s: %w", orgID, err)
			}
		}
		if err := c.AssignOrganizationRolesToUser(ctx, orgID, r.BootstrapUserID, []string{platformAdminRoleID}); err != nil {
			var apiErr *logto.APIError
			if !(errors.As(err, &apiErr) && apiErr.Status == 422) {
				return fmt.Errorf("assign role in org %s: %w", orgID, err)
			}
		}
	}
	log.Printf("✓ Bootstrap admin is platform_admin in %d sport org(s)", len(orgIDs))
	return nil
}

func seedWebhook(ctx context.Context, c *logto.Client, cfg *config, r *seedResult) error {
	existing, err := c.FindHookByName(ctx, courtCommandHookName)
	if err != nil {
		return fmt.Errorf("find hook: %w", err)
	}
	if existing != nil {
		log.Printf("✓ Webhook %q exists (id=%s)", courtCommandHookName, existing.ID)
		r.WebhookSigningKey = existing.SigningKey
		return nil
	}
	created, err := c.CreateHook(ctx, logto.CreateHookParams{
		Name:    courtCommandHookName,
		Events:  hookEvents,
		Config:  map[string]interface{}{"url": cfg.WebhookURL},
		Enabled: true,
	})
	if err != nil {
		return fmt.Errorf("create hook: %w", err)
	}
	log.Printf("✓ Created webhook %q (id=%s) -> %s", courtCommandHookName, created.ID, cfg.WebhookURL)
	r.WebhookSigningKey = created.SigningKey
	return nil
}

// seedAPIUserRole creates a Logto User-type role bound to all 12 API
// resource scopes and assigns it to the bootstrap admin. Without this
// the SPA receives an access token that has the org scopes (manage_*,
// read_all) but NONE of the API resource scopes (write:profile, etc.),
// so every protected handler returns 403.
//
// Idempotent: the role is found by name; existing scope bindings are
// skipped; user-role grants treat 422 as already-assigned.
func seedAPIUserRole(ctx context.Context, c *logto.Client, _ *config, r *seedResult) error {
	if r.APIResourceID == "" {
		return fmt.Errorf("APIResourceID not set -- seedAPIResource must run first")
	}
	if r.BootstrapUserID == "" {
		return fmt.Errorf("BootstrapUserID not set -- seedBootstrapAdmin must run first")
	}

	// Step 1: find or create the role.
	role, err := c.FindRoleByName(ctx, apiUserRoleName)
	if err != nil {
		return fmt.Errorf("find role: %w", err)
	}
	if role == nil {
		created, err := c.CreateRole(ctx, logto.CreateRoleParams{
			Name:        apiUserRoleName,
			Description: "Grants every Court Command API scope. Assigned to dev/admin users so their JWTs carry write:profile, manage_*, etc.",
			Type:        "User",
		})
		if err != nil {
			return fmt.Errorf("create role: %w", err)
		}
		role = created
		log.Printf("✓ Created Logto user role %q (id=%s)", apiUserRoleName, role.ID)
	} else {
		log.Printf("✓ Logto user role %q exists (id=%s)", apiUserRoleName, role.ID)
	}
	r.APIUserRoleID = role.ID

	// Step 2: bind every API resource scope to the role (idempotent).
	allScopes, err := c.ListResourceScopes(ctx, r.APIResourceID)
	if err != nil {
		return fmt.Errorf("list resource scopes: %w", err)
	}
	bound, err := c.ListRoleScopes(ctx, role.ID)
	if err != nil {
		return fmt.Errorf("list role scopes: %w", err)
	}
	boundSet := make(map[string]bool, len(bound))
	for _, s := range bound {
		boundSet[s.ID] = true
	}
	var toBind []string
	for _, s := range allScopes {
		if !boundSet[s.ID] {
			toBind = append(toBind, s.ID)
		}
	}
	if len(toBind) > 0 {
		// Logto's POST /api/roles/{id}/scopes accepts a list and is
		// generally OK with adding new scopes; if any one is already
		// bound it returns 422. We pre-filtered, but allow that
		// race in case the server state shifted between list and post.
		if err := c.AssignScopesToRole(ctx, role.ID, toBind); err != nil {
			var apiErr *logto.APIError
			if errors.As(err, &apiErr) && apiErr.Status == 422 {
				log.Printf("✓ API role scope bindings already current (422 from Logto)")
			} else {
				return fmt.Errorf("assign scopes to role: %w", err)
			}
		}
	}
	log.Printf("✓ API role scopes: %d existing, %d added (target: %d)", len(bound), len(toBind), len(allScopes))

	// Step 3: grant the role to the bootstrap admin (idempotent).
	if err := c.AssignRolesToUser(ctx, r.BootstrapUserID, []string{role.ID}); err != nil {
		var apiErr *logto.APIError
		if errors.As(err, &apiErr) && apiErr.Status == 422 {
			log.Printf("✓ Bootstrap admin already has %q role", apiUserRoleName)
			return nil
		}
		return fmt.Errorf("assign role to user: %w", err)
	}
	log.Printf("✓ Granted %q role to bootstrap admin", apiUserRoleName)
	return nil
}

// seedEmailConnector ensures the tenant has an email connector that
// matches the seeder's environment.
//
// Two modes:
//   - Production / real-email: when SMTP env vars are configured, register
//     (or PATCH) a `simple-mail-transfer-protocol` connector with the
//     supplied SMTP credentials and the four canonical email templates
//     (Register, SignIn, ForgotPassword, Generic). If a leftover
//     `http-email` discard connector exists from a prior dev seed, delete
//     it first so Logto picks the SMTP one.
//   - Local-dev / no-email: when SMTP isn't configured, register the
//     legacy `http-email` connector pointed at a discard URL. Logto
//     refuses to enable email-based sign-in without ANY email connector;
//     the discard endpoint satisfies the validator while ensuring no
//     email actually leaves the host.
//
// The function is idempotent and safe to re-run.
func seedEmailConnector(ctx context.Context, c *logto.Client, cfg *config) error {
	const (
		httpEmailConnectorID = "http-email"
		smtpConnectorID      = "simple-mail-transfer-protocol"
	)

	existing, err := c.ListConnectors(ctx)
	if err != nil {
		return fmt.Errorf("list connectors: %w", err)
	}
	var (
		existingHTTP *logto.Connector
		existingSMTP *logto.Connector
	)
	for i := range existing {
		switch existing[i].ConnectorID {
		case httpEmailConnectorID:
			existingHTTP = &existing[i]
		case smtpConnectorID:
			existingSMTP = &existing[i]
		}
	}

	if !cfg.smtpConfigured() {
		// Dev path: ensure a discard http-email connector exists.
		if existingHTTP != nil {
			log.Printf("✓ Email connector %q exists (id=%s; discard endpoint)", httpEmailConnectorID, existingHTTP.ID)
			return nil
		}
		created, err := c.CreateConnector(ctx, logto.CreateConnectorParams{
			ConnectorID: httpEmailConnectorID,
			Config: map[string]interface{}{
				"endpoint": "http://localhost:9999/discard",
			},
		})
		if err != nil {
			return fmt.Errorf("create http-email connector: %w", err)
		}
		log.Printf("✓ Registered email connector %q (id=%s; discard endpoint -- no real email)", httpEmailConnectorID, created.ID)
		return nil
	}

	// Production path: SMTP connector with Resend (or any SMTP provider).
	smtpConfig := map[string]interface{}{
		"host":   cfg.SMTPHost,
		"port":   cfg.SMTPPort,
		"secure": cfg.SMTPPort == 465,
		"auth": map[string]interface{}{
			"user": cfg.SMTPUser,
			"pass": cfg.SMTPPass,
		},
		"fromEmail": cfg.EmailFrom,
		"fromName":  cfg.EmailFromName,
		"templates": defaultEmailTemplates(),
	}

	if existingSMTP != nil {
		// Update in place so we don't disrupt any in-flight verification
		// codes that might be tied to the connector instance ID.
		if _, err := c.UpdateConnector(ctx, existingSMTP.ID, logto.UpdateConnectorParams{
			Config: smtpConfig,
		}); err != nil {
			return fmt.Errorf("update SMTP connector: %w", err)
		}
		log.Printf("✓ SMTP connector %q reconfigured (id=%s, host=%s:%d, from=%s)",
			smtpConnectorID, existingSMTP.ID, cfg.SMTPHost, cfg.SMTPPort, cfg.EmailFrom)
	} else {
		created, err := c.CreateConnector(ctx, logto.CreateConnectorParams{
			ConnectorID: smtpConnectorID,
			Config:      smtpConfig,
		})
		if err != nil {
			return fmt.Errorf("create SMTP connector: %w", err)
		}
		log.Printf("✓ Registered SMTP connector %q (id=%s, host=%s:%d, from=%s)",
			smtpConnectorID, created.ID, cfg.SMTPHost, cfg.SMTPPort, cfg.EmailFrom)
	}

	// Tear down the dev discard connector if we just promoted to SMTP.
	// Logto allows multiple email connectors but will round-robin or
	// pick one arbitrarily; safer to leave only one.
	if existingHTTP != nil {
		if err := c.DeleteConnector(ctx, existingHTTP.ID); err != nil {
			log.Printf("warning: failed to delete leftover http-email connector %s: %v", existingHTTP.ID, err)
		} else {
			log.Printf("✓ Removed leftover http-email discard connector (id=%s)", existingHTTP.ID)
		}
	}
	return nil
}

// defaultEmailTemplates returns the canonical Logto email templates
// the SMTP connector requires. Each template is plain HTML with a
// {{code}} placeholder Logto interpolates with the verification code.
func defaultEmailTemplates() []map[string]interface{} {
	tmpl := func(usageType, subject, intro string) map[string]interface{} {
		body := fmt.Sprintf(`<!DOCTYPE html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
<h2 style="color: #111;">Court Command</h2>
<p>%s</p>
<p style="font-size: 28px; letter-spacing: 4px; font-weight: 700; padding: 16px 24px; background: #f3f4f6; border-radius: 8px; text-align: center; font-family: ui-monospace, monospace;">{{code}}</p>
<p style="color: #6b7280; font-size: 13px;">If you didn't request this code, you can safely ignore this email.</p>
</body></html>`, intro)
		return map[string]interface{}{
			"usageType":   usageType,
			"type":        "EmailTemplateType.Generic", // Logto wants this string literal
			"subject":     subject,
			"content":     body,
			"contentType": "text/html",
		}
	}
	return []map[string]interface{}{
		tmpl("Register", "Welcome to Court Command — verify your email", "Welcome! Your verification code is:"),
		tmpl("SignIn", "Court Command sign-in code", "Your sign-in code is:"),
		tmpl("ForgotPassword", "Reset your Court Command password", "Your password reset code is:"),
		tmpl("Generic", "Court Command verification code", "Your verification code is:"),
	}
}

// seedSignInExperience configures the tenant to accept email-based
// sign-in. Default Logto installs only enable username+password; users
// created with primaryEmail (no username) cannot sign in until this
// runs. Idempotent: PATCH always overwrites with the same payload, so
// re-running is a no-op.
//
// Requires seedEmailConnector to run first; Logto rejects email
// methods without a configured email connector.
//
// SignUp.Verify is true when SMTP is configured (email codes can
// actually deliver) and forced false when SMTP isn't configured
// (otherwise sign-up would fail on every code-send because Logto
// can't deliver via the http-email discard endpoint). Local dev
// thus runs verify=false and skips email validation entirely.
func seedSignInExperience(ctx context.Context, c *logto.Client, cfg *config) error {
	verify := cfg.EmailVerifyOnSignUp && cfg.smtpConfigured()
	params := logto.UpdateSignInExperienceParams{
		SignIn: &logto.SignInConfig{
			Methods: []logto.SignInMethod{
				{
					Identifier:        logto.SignInIdentifierEmail,
					Password:          true,
					VerificationCode:  cfg.smtpConfigured(), // enable magic-link sign-in when email works
					IsPasswordPrimary: true,
				},
				{
					Identifier:        logto.SignInIdentifierUsername,
					Password:          true,
					VerificationCode:  false,
					IsPasswordPrimary: false,
				},
			},
		},
		SignUp: &logto.SignUpConfig{
			Identifiers: []logto.SignInIdentifier{logto.SignInIdentifierEmail},
			Password:    true,
			Verify:      verify,
		},
	}
	if err := c.UpdateSignInExperience(ctx, params); err != nil {
		return fmt.Errorf("update sign-in experience: %w", err)
	}
	log.Printf("✓ Sign-in experience configured (email + username; signup verify=%t, magic-link sign-in=%t)",
		verify, cfg.smtpConfigured())
	return nil
}

// syncSportsOrgIDs connects to the Court Command application database
// and updates sports.logto_org_id rows to match the Pickleball and
// Demo Sport orgs the seeder just created in Logto. Without this sync,
// the backend's apiFetch -> SportProvider chain cannot resolve a slug
// to a Logto org ID and every X-Sport request will 403.
//
// Skipped silently if DATABASE_URL is unset (e.g. an operator running
// the seeder without the app stack up). Logs a warning so the operator
// knows to patch sports.logto_org_id manually.
func syncSportsOrgIDs(ctx context.Context, cfg *config, r *seedResult) error {
	if cfg.DatabaseURL == "" {
		log.Printf("⚠ DATABASE_URL not set -- skipping sports.logto_org_id sync. Patch by hand:")
		if r.PickleballOrgID != "" {
			log.Printf("    UPDATE sports SET logto_org_id='%s' WHERE slug='pickleball';", r.PickleballOrgID)
		}
		if r.DemoSportOrgID != "" {
			log.Printf("    UPDATE sports SET logto_org_id='%s' WHERE slug='demo_sport';", r.DemoSportOrgID)
		} else if !cfg.SeedDemoSport {
			log.Printf("    UPDATE sports SET is_active=false WHERE slug='demo_sport'; -- production launch mode")
		}
		return nil
	}
	if r.PickleballOrgID == "" {
		return fmt.Errorf("PickleballOrgID not set -- seedOrganizations must run first")
	}
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect to app database: %w", err)
	}
	defer pool.Close()

	tag, err := pool.Exec(ctx,
		"UPDATE sports SET logto_org_id=$1 WHERE slug='pickleball'",
		r.PickleballOrgID)
	if err != nil {
		return fmt.Errorf("update pickleball: %w", err)
	}
	pickleballRows := tag.RowsAffected()

	var demoRows int64
	if r.DemoSportOrgID != "" {
		// Demo Sport was seeded (or pre-existed): keep its logto_org_id
		// in sync. Make sure it's also is_active=true in case a previous
		// production-launch seed had deactivated it.
		tag, err := pool.Exec(ctx,
			"UPDATE sports SET logto_org_id=$1, is_active=true WHERE slug='demo_sport'",
			r.DemoSportOrgID)
		if err != nil {
			return fmt.Errorf("update demo_sport: %w", err)
		}
		demoRows = tag.RowsAffected()
	} else if !cfg.SeedDemoSport {
		// Production launch mode: hide Demo Sport from the picker by
		// flipping is_active=false. The local row stays in place (so
		// any historical foreign-key references still resolve), but
		// /api/v1/sports filters where is_active=true and the SPA only
		// sees Pickleball -- triggering the auto-redirect.
		tag, err := pool.Exec(ctx,
			"UPDATE sports SET is_active=false WHERE slug='demo_sport'")
		if err != nil {
			return fmt.Errorf("deactivate demo_sport: %w", err)
		}
		log.Printf("✓ Demo Sport hidden from picker (is_active=false; %d row(s))", tag.RowsAffected())
	}

	log.Printf("✓ Synced sports.logto_org_id (pickleball: %d row(s), demo_sport: %d row(s))",
		pickleballRows, demoRows)
	if pickleballRows == 0 && demoRows == 0 {
		log.Printf("⚠ Zero rows updated -- did migrations run? (sports table may be empty)")
	}
	return nil
}

func printSummary(cfg *config, r *seedResult) {
	fmt.Println()
	fmt.Println("=================================================================")
	fmt.Println(" Logto seed complete -- copy the values below into your .env")
	fmt.Println("=================================================================")
	fmt.Println()
	fmt.Printf("LOGTO_ENDPOINT=%s\n", cfg.Endpoint)
	fmt.Printf("LOGTO_API_RESOURCE=%s\n", cfg.APIResourceIndicator)
	fmt.Printf("LOGTO_PICKLEBALL_ORG_ID=%s\n", r.PickleballOrgID)
	fmt.Printf("LOGTO_DEMO_SPORT_ORG_ID=%s\n", r.DemoSportOrgID)
	if r.WebhookSigningKey != "" {
		fmt.Printf("LOGTO_WEBHOOK_SIGNING_KEY=%s\n", r.WebhookSigningKey)
	} else {
		fmt.Println("# LOGTO_WEBHOOK_SIGNING_KEY=<webhook already existed; copy from Logto admin UI>")
	}
	fmt.Println()
	fmt.Println("# Frontend (Vite build args)")
	fmt.Printf("VITE_LOGTO_ENDPOINT=%s\n", cfg.Endpoint)
	fmt.Printf("VITE_LOGTO_APP_ID=%s\n", r.SPAAppID)
	fmt.Printf("VITE_LOGTO_API_RESOURCE=%s\n", cfg.APIResourceIndicator)
	fmt.Println()
	fmt.Println("# Bootstrap admin (sign in at the SPA redirect URL after webhook fires):")
	fmt.Printf("#   email:    %s\n", cfg.BootstrapEmail)
	fmt.Printf("#   password: %s\n", cfg.BootstrapPassword)
	fmt.Printf("#   user_id:  %s\n", r.BootstrapUserID)
	fmt.Println()
	fmt.Println("Re-running this script is safe: every step is idempotent.")
}
