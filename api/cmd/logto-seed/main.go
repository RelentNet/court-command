// Command logto-seed is a thin CLI wrapper around the logtoseed package.
//
// As of the auto-bootstrap migration, the api itself invokes
// logtoseed.Run on every boot, so this binary is no longer required for
// normal operation. It is retained for:
//
//   - Local development without the full api running (`make logto-seed`)
//   - Operator debugging: re-running provisioning out-of-band against a
//     misbehaving tenant, or running it once before the api starts (e.g.
//     when standing up a brand-new environment and you want to capture
//     the SPA app ID + webhook signing key BEFORE building the web image).
//   - CI / automation that prefers an explicit one-shot to running the
//     api for its side effects.
//
// All actual logic lives in api/logtoseed; this main is just env loading
// + a context, a database pool, an http client, and a summary printer.
//
// Required env vars:
//
//	LOGTO_ENDPOINT                  e.g. http://localhost:3001
//	LOGTO_MANAGEMENT_API_APP_ID     M2M app ID (operator-created in admin UI)
//	LOGTO_MANAGEMENT_API_APP_SECRET M2M app secret
//
// See api/logtoseed/config.go for the full env reference.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/court-command/court-command/logto"
	"github.com/court-command/court-command/logtoseed"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	// Match the api's structured-log convention so CLI output and api
	// logs are interchangeable when piped to log collectors.
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	cfg, err := logtoseed.LoadConfigFromEnv()
	if err != nil {
		slog.Error("config error", "error", err)
		os.Exit(1)
	}

	client := logto.NewClient(logto.Config{
		Endpoint:               cfg.Endpoint,
		ManagementAPIAppID:     cfg.MgmtAppID,
		ManagementAPIAppSecret: cfg.MgmtAppSecret,
		ManagementAPIResource:  cfg.MgmtAPIResource,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// DATABASE_URL is optional for the CLI: an operator running this
	// against a fresh Logto without the app stack up should still get
	// orgs created, just without the local DB sync. The api always
	// runs with a pool.
	var pool *pgxpool.Pool
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		p, err := pgxpool.New(ctx, dbURL)
		if err != nil {
			slog.Error("connect to app database", "error", err)
			os.Exit(1)
		}
		defer p.Close()
		pool = p
	} else {
		slog.Warn("DATABASE_URL not set -- skipping sports.logto_org_id sync; patch by hand using the org IDs printed below")
	}

	result, err := logtoseed.Run(ctx, cfg, client, pool)
	if err != nil {
		slog.Error("logto seed failed", "error", err)
		// Print whatever partial state we got so the operator can act on it.
		printSummary(cfg, result)
		os.Exit(1)
	}

	printSummary(cfg, result)
}

// printSummary writes the env values an operator needs to capture from a
// fresh seed. The api invokes Run silently and logs to slog -- this
// summary exists for the human at the terminal.
func printSummary(cfg *logtoseed.Config, r *logtoseed.Result) {
	if r == nil {
		return
	}
	fmt.Println()
	fmt.Println("=================================================================")
	fmt.Println(" Logto seed complete -- copy values below into your env if new")
	fmt.Println("=================================================================")
	fmt.Println()
	fmt.Printf("LOGTO_ENDPOINT=%s\n", cfg.Endpoint)
	fmt.Printf("LOGTO_API_RESOURCE=%s\n", cfg.APIResourceIndicator)
	fmt.Printf("LOGTO_PICKLEBALL_ORG_ID=%s\n", r.PickleballOrgID)
	if r.DemoSportOrgID != "" {
		fmt.Printf("LOGTO_DEMO_SPORT_ORG_ID=%s\n", r.DemoSportOrgID)
	}
	if r.WebhookSigningKey != "" {
		fmt.Printf("LOGTO_WEBHOOK_SIGNING_KEY=%s\n", r.WebhookSigningKey)
	}
	fmt.Println()
	fmt.Println("# Frontend (Vite build args)")
	fmt.Printf("VITE_LOGTO_ENDPOINT=%s\n", cfg.Endpoint)
	fmt.Printf("VITE_LOGTO_APP_ID=%s\n", r.SPAAppID)
	fmt.Printf("VITE_LOGTO_API_RESOURCE=%s\n", cfg.APIResourceIndicator)
	fmt.Println()
	if r.SPAAppCreated {
		fmt.Println("** SPA app was CREATED on this run. The web image must be rebuilt with the VITE_LOGTO_APP_ID above. **")
	}
	if r.WebhookCreated {
		fmt.Println("** Webhook was CREATED on this run. Set LOGTO_WEBHOOK_SIGNING_KEY in api env to the value above and redeploy the api. **")
	}
	fmt.Println("# Bootstrap admin (sign in at the SPA after webhook fires):")
	fmt.Printf("#   email:    %s\n", cfg.BootstrapEmail)
	fmt.Printf("#   user_id:  %s\n", r.BootstrapUserID)
	fmt.Println()
	fmt.Println("Re-running this CLI is safe; the api auto-runs the same logic on boot.")
}
