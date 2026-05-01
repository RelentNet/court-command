// Command logto-seed idempotently provisions a Logto tenant with everything
// Court Command needs: SPA app, Court Command API resource + scopes, M2M app
// role assignment, organization template (roles + scopes + role-scope
// mappings), Pickleball + Demo Sport organizations, bootstrap admin user
// with platform_admin role in both orgs, and the Court Command webhook.
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
	"strings"
	"time"

	"github.com/court-command/court-command/logto"
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
	if err := seedOrganizations(ctx, client, result); err != nil {
		log.Fatalf("organizations: %v", err)
	}
	if err := seedBootstrapAdmin(ctx, client, cfg, result); err != nil {
		log.Fatalf("bootstrap admin: %v", err)
	}
	if err := seedWebhook(ctx, client, cfg, result); err != nil {
		log.Fatalf("webhook: %v", err)
	}

	printSummary(cfg, result)
}

type seedResult struct {
	APIResourceID    string
	SPAAppID         string
	OrgScopeIDs      map[string]string // scope name -> ID
	OrgRoleIDs       map[string]string // role name -> ID
	PickleballOrgID  string
	DemoSportOrgID   string
	BootstrapUserID  string
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

func seedOrganizations(ctx context.Context, c *logto.Client, r *seedResult) error {
	for _, spec := range []struct {
		name, desc string
		idField    *string
	}{
		{pickleballOrgName, pickleballOrgDesc, &r.PickleballOrgID},
		{demoSportOrgName, demoSportOrgDesc, &r.DemoSportOrgID},
	} {
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

	for _, orgID := range []string{r.PickleballOrgID, r.DemoSportOrgID} {
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
	log.Printf("✓ Bootstrap admin is platform_admin in both sport orgs")
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
