// api/main.go
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/config"
	"github.com/court-command/court-command/db"
	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/handler"
	"github.com/court-command/court-command/jobs"
	"github.com/court-command/court-command/logto"
	"github.com/court-command/court-command/logtoseed"
	"github.com/court-command/court-command/middleware"
	"github.com/court-command/court-command/overlay"
	"github.com/court-command/court-command/pubsub"
	"github.com/court-command/court-command/router"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
	"github.com/court-command/court-command/startup"
	"github.com/court-command/court-command/ws"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	slog.Info("running database migrations")
	if err := db.RunMigrations(ctx, cfg.DatabaseURL); err != nil {
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	sessionStore, err := session.NewStore(cfg.RedisURL)
	if err != nil {
		slog.Error("failed to connect to redis", "error", err)
		os.Exit(1)
	}
	defer sessionStore.Close()

	queries := generated.New(pool)

	// Phase 1+2 services
	authService := service.NewAuthService(pool, sessionStore)
	playerService := service.NewPlayerService(queries)
	teamService := service.NewTeamService(queries)
	orgService := service.NewOrganizationService(queries, pool)
	venueService := service.NewVenueService(queries)

	// Phase 3 services
	leagueService := service.NewLeagueService(queries)
	tournamentStaffService := service.NewTournamentStaffService(queries, pool)
	tournamentService := service.NewTournamentService(queries, pool, tournamentStaffService)
	divisionService := service.NewDivisionService(queries)
	registrationService := service.NewRegistrationService(queries)
	seasonService := service.NewSeasonService(queries)
	podService := service.NewPodService(queries)
	announcementService := service.NewAnnouncementService(queries)

	// Phase 4C: pub/sub for real-time updates
	ps := pubsub.New(sessionStore.Client(), logger)

	// Phase 4A services
	scoringPresetService := service.NewScoringPresetService(queries)
	matchService := service.NewMatchService(queries, pool, ps, logger)
	// Wire MatchService into VenueService so ListCourtsByTournament
	// returns the fully-enriched nested match shape (team summaries,
	// division/tournament/court names, timeouts counts, etc.).
	venueService.SetMatchService(matchService)

	// Phase 4D services
	bracketService := service.NewBracketService(queries, pool)
	courtQueueService := service.NewCourtQueueService(queries, pool, ps)

	// Phase 1+2 handlers
	secureCookie := !cfg.IsDevelopment()
	authHandler := handler.NewAuthHandler(authService, secureCookie)
	healthHandler := handler.NewHealthHandler(pool, sessionStore.Client())
	playerHandler := handler.NewPlayerHandler(playerService)
	teamHandler := handler.NewTeamHandler(teamService)
	orgHandler := handler.NewOrgHandler(orgService, teamService)
	venueHandler := handler.NewVenueHandler(venueService)
	courtHandler := handler.NewCourtHandler(venueService)

	// Phase 3 handlers
	leagueHandler := handler.NewLeagueHandler(leagueService)
	tournamentHandler := handler.NewTournamentHandler(tournamentService)
	tournamentStaffHandler := handler.NewTournamentStaffHandler(tournamentStaffService, tournamentService)
	divisionHandler := handler.NewDivisionHandler(divisionService)
	registrationHandler := handler.NewRegistrationHandler(registrationService)
	seasonHandler := handler.NewSeasonHandler(seasonService)
	podHandler := handler.NewPodHandler(podService)
	announcementHandler := handler.NewAnnouncementHandler(announcementService)
	divTemplateHandler := handler.NewDivisionTemplateHandler(queries)
	leagueRegHandler := handler.NewLeagueRegistrationHandler(queries)

	// Phase 4A handlers
	scoringPresetHandler := handler.NewScoringPresetHandler(scoringPresetService)
	matchHandler := handler.NewMatchHandler(matchService)

	// Phase 4D handlers
	bracketHandler := handler.NewBracketHandler(bracketService)
	courtQueueHandler := handler.NewCourtQueueHandler(courtQueueService)

	// Phase 4E services + handlers
	matchSeriesService := service.NewMatchSeriesService(queries, pool, ps)
	matchSeriesHandler := handler.NewMatchSeriesHandler(matchSeriesService)
	quickMatchHandler := handler.NewQuickMatchHandler(matchService)

	// Phase 6: Standings
	standingsService := service.NewStandingsService(queries)
	standingsHandler := handler.NewStandingsHandler(standingsService)

	// Phase 7: Public & Player Experience
	dashboardService := service.NewDashboardService(queries)
	searchService := service.NewSearchService(queries)

	// Phase 5: Overlay
	overlayResolver := overlay.NewResolver(queries, logger)
	overlayService := service.NewOverlayService(pool, queries, overlayResolver, ps)
	sourceProfileService := service.NewSourceProfileService(queries)
	overlayHandler := handler.NewOverlayHandler(overlayService, sourceProfileService)
	sourceProfileHandler := handler.NewSourceProfileHandler(sourceProfileService)

	// Phase 7: Handlers
	dashboardHandler := handler.NewDashboardHandler(dashboardService)
	searchHandler := handler.NewSearchHandler(searchService)
	publicHandler := handler.NewPublicHandler(queries)
	publicHandler.SetMatchService(matchService)
	publicHandler.SetDivisionService(divisionService)
	publicHandler.SetVenueService(venueService)
	publicHandler.SetSeasonService(seasonService)
	publicHandler.SetTournamentService(tournamentService)

	// Phase 8: Admin & Platform Management
	activityLogService := service.NewActivityLogService(queries)
	apiKeyService := service.NewApiKeyService(queries)
	uploadService := service.NewUploadService(queries, "uploads")
	adService := service.NewAdService(queries)
	// adminHandler is constructed below, after logtoClient is built, because
	// the Logto-native impersonation endpoint needs the Management API client.
	uploadHandler := handler.NewUploadHandler(uploadService)
	adHandler := handler.NewAdHandler(adService)

	// CMS Settings
	settingsService := service.NewSettingsService(pool)
	settingsHandler := handler.NewSettingsHandler(settingsService)

	// Logto Phase 3: public sport directory
	sportsService := service.NewSportsService(queries)
	sportsHandler := handler.NewSportsHandler(sportsService)

	// Logto Phase 3: profile endpoints + JWT validator. The discovery
	// document at LOGTO_ENDPOINT/oidc/.well-known/openid-configuration
	// publishes the canonical issuer with the /oidc suffix; tokens
	// minted by Logto carry that exact iss claim. Building the issuer
	// URL by appending "/oidc" matches both self-hosted and cloud Logto
	// deployments. JWKS lives at the same /oidc/jwks path on both.
	logtoEndpoint := os.Getenv("LOGTO_ENDPOINT")
	logtoAPIResource := os.Getenv("LOGTO_API_RESOURCE")
	mgmtAppID := os.Getenv("LOGTO_MANAGEMENT_API_APP_ID")
	mgmtAppSecret := os.Getenv("LOGTO_MANAGEMENT_API_APP_SECRET")
	mgmtResource := os.Getenv("LOGTO_MANAGEMENT_API_RESOURCE")
	webhookSigningKey := os.Getenv("LOGTO_WEBHOOK_SIGNING_KEY")

	// Phase 3.6 review I5: fail-fast in production when ANY required
	// Logto env var is missing. Pre-3.6 we only checked the four Mgmt
	// API vars (I1); this expanded check also covers LOGTO_API_RESOURCE
	// (without it, jwtValidator is nil and the SPA's JWT requests 401)
	// and LOGTO_WEBHOOK_SIGNING_KEY (without it, webhook deliveries 500
	// at runtime). cfg.IsProduction() treats anything that isn't a
	// recognized dev marker as production, so APP_ENV=staging /
	// APP_ENV=prod also trip the check.
	if cfg.IsProduction() {
		var missing []string
		if logtoEndpoint == "" {
			missing = append(missing, "LOGTO_ENDPOINT")
		}
		if logtoAPIResource == "" {
			missing = append(missing, "LOGTO_API_RESOURCE")
		}
		if mgmtAppID == "" {
			missing = append(missing, "LOGTO_MANAGEMENT_API_APP_ID")
		}
		if mgmtAppSecret == "" {
			missing = append(missing, "LOGTO_MANAGEMENT_API_APP_SECRET")
		}
		if mgmtResource == "" {
			missing = append(missing, "LOGTO_MANAGEMENT_API_RESOURCE")
		}
		if webhookSigningKey == "" {
			missing = append(missing, "LOGTO_WEBHOOK_SIGNING_KEY")
		}
		if len(missing) > 0 {
			slog.Error("required Logto env vars missing in production",
				"missing", missing,
				"env", cfg.Env)
			os.Exit(1)
		}
	}

	var jwtValidator *auth.Validator
	var profileHandler *handler.ProfileHandler
	if logtoEndpoint != "" && logtoAPIResource != "" {
		jwtValidator = auth.NewValidator(
			logtoEndpoint+"/oidc",
			logtoEndpoint+"/oidc/jwks",
			logtoAPIResource,
		)
		profileService := service.NewProfileService(queries)
		profileHandler = handler.NewProfileHandler(profileService)
	} else {
		slog.Warn("LOGTO_ENDPOINT or LOGTO_API_RESOURCE not set; /api/v1/me/profile disabled")
	}

	// Logto Phase 3 Task 9: webhook handler + on-demand user mirror.
	//
	// The webhook is constructed unconditionally (it short-circuits
	// to 500 INTERNAL_ERROR if the signing key is empty, so an
	// accidental misconfiguration can't silently accept unsigned
	// requests). The Logto Management API client is constructed
	// only when all four env vars are set; without it MirrorUser
	// is left disabled (the router conditionally chains it).
	userSyncService := service.NewUserSyncService(queries)
	webhookHandler := handler.NewLogtoWebhookHandler(
		userSyncService,
		webhookSigningKey,
	)

	var logtoClient *logto.Client
	if logtoEndpoint != "" && mgmtAppID != "" && mgmtAppSecret != "" && mgmtResource != "" {
		logtoClient = logto.NewClient(logto.Config{
			Endpoint:               logtoEndpoint,
			ManagementAPIAppID:     mgmtAppID,
			ManagementAPIAppSecret: mgmtAppSecret,
			ManagementAPIResource:  mgmtResource,
		})
	} else {
		slog.Warn("Logto Management API env vars missing; on-demand user mirror disabled (dev only)")
	}

	// Admin handler depends on logtoClient for Logto-native impersonation
	// (subject-token minting). logtoClient may be nil in dev without Mgmt API
	// creds; the impersonate endpoint 503s in that case.
	adminHandler := handler.NewAdminHandler(queries, activityLogService, apiKeyService, sessionStore, uploadService, logtoClient)

	// OrgRoleResolver bridges the gap between Logto's published token
	// behavior and what the api expected. Logto does NOT include the
	// organization_roles claim in API-resource access tokens (only in
	// ID tokens and userinfo). Without this resolver,
	// claims.ElevatedRole() always returns "" and no user ever gets
	// elevated to platform_admin -- even though they hold the role in
	// Logto Console. The resolver fills that gap by asking the
	// Management API for the user's roles on each authenticated
	// request, caching in Redis (TTL configurable via
	// LOGTO_ORG_ROLES_CACHE_TTL_SECONDS, default 60s) so warm caches
	// absorb the bulk of traffic. See
	// api/middleware/org_role_resolver.go for the rationale and code.
	var orgRoleResolver middleware.OrgRoleResolver
	if logtoClient != nil {
		orgRoleResolver = middleware.NewLogtoMgmtAPIResolver(
			logtoClient, sessionStore.Client(), middleware.OrgRolesCacheTTLFromEnv())
	}

	// Auto-bootstrap the Logto tenant on every boot. This calls the
	// same idempotent provisioning logic as the api/cmd/logto-seed CLI:
	//   - registers the API resource + 12 scopes
	//   - finds-or-creates the SPA app, refusing to silently regenerate
	//     when LOGTO_SPA_APP_ID is set (drift protection for the
	//     baked-in VITE_LOGTO_APP_ID)
	//   - finds-or-creates the Pickleball + (optionally) Demo Sport orgs
	//   - ensures LOGTO_BOOTSTRAP_EMAIL exists in Logto and holds
	//     platform_admin in every sport org
	//   - registers the email connector + sign-in experience
	//   - finds-or-creates the webhook, refusing to silently regenerate
	//     when LOGTO_WEBHOOK_SIGNING_KEY is set
	//   - syncs sports.logto_org_id in the application DB to match the
	//     real Logto org IDs (under a Postgres advisory lock)
	//
	// The end result: a fresh deploy comes up fully configured without
	// any manual SQL or seeder runs. Re-running on every boot is cheap
	// (~10 idempotent Mgmt API calls; <2 seconds when nothing changes)
	// and self-healing for cases like a Logto restore that changes org IDs.
	//
	// In production a failure here exits the process so the operator
	// learns immediately. In development we warn and continue so local
	// stacks without M2M creds still come up. No-op when logtoClient
	// is nil (Mgmt API creds absent).
	if logtoClient != nil {
		seedCfg, err := logtoseed.LoadConfigFromEnv()
		if err != nil {
			if cfg.IsProduction() {
				slog.Error("logto seed config", "error", err)
				os.Exit(1)
			}
			slog.Warn("logto seed config (dev mode -- skipping auto-bootstrap)", "error", err)
		} else {
			if _, err := logtoseed.Run(ctx, seedCfg, logtoClient, pool); err != nil {
				if cfg.IsProduction() {
					slog.Error("logto auto-bootstrap failed", "error", err)
					os.Exit(1)
				}
				slog.Warn("logto auto-bootstrap failed (dev mode -- continuing)", "error", err)
			}
		}
	}

	// Belt-and-suspenders verification: even after Run succeeds, confirm
	// every active sports.logto_org_id resolves to a real Logto org.
	// Catches scenarios the seeder couldn't fix (e.g. a manually-added
	// sport row pointing at a deleted org, or a partially-applied Run
	// that bailed before syncSportsOrgIDs).
	if err := startup.VerifySportsOrgIDsFromDB(ctx, pool, logtoClient, cfg.IsProduction()); err != nil {
		slog.Error("sports.logto_org_id verification failed", "error", err)
		os.Exit(1)
	}

	// Build the slug -> Logto-org-ID resolver that backs
	// RequireSportMatchesJWT on sport-scoped protected routes. It reads
	// the same sports.logto_org_id column the verifier above checks, so
	// by this point the IDs are real (the seeder + verifier ran first).
	// Placeholder rows (pending-seed:*) are skipped; an unknown slug in
	// the resolver yields a 400 from the middleware rather than a silent
	// cross-sport bypass. When logtoClient is nil (dev without Mgmt API)
	// the JWT path is also disabled, so a nil/empty resolver simply means
	// the sport check is never chained -- see router.useAuth.
	var sportResolver *middleware.SportResolver
	{
		activeSports, err := startup.LoadActiveSportsFromDB(ctx, pool)
		if err != nil {
			slog.Error("load active sports for sport resolver", "error", err)
			os.Exit(1)
		}
		slugToOrgID := make(map[string]string, len(activeSports))
		for _, s := range activeSports {
			if s.OrgID == "" || startup.IsPendingSeedPlaceholder(s.OrgID) {
				continue
			}
			slugToOrgID[s.Slug] = s.OrgID
		}
		sportResolver = middleware.NewSportResolver(slugToOrgID)
		slog.Info("sport resolver built", "sports", len(slugToOrgID))
	}

	// Phase 4C: WebSocket handler. CheckOrigin is restricted to the
	// configured CORS origins (plus empty-Origin non-browser clients);
	// the web origin must be in CORS_ALLOWED_ORIGINS so OBS / browser-
	// source overlays can connect.
	wsHandler := ws.NewHandler(ps, logger, cfg.CORSAllowedOrigins)

	// Start background jobs
	jobs.StartQuickMatchCleanup(ctx, matchService, logger)
	jobs.StartUploadCleanup(ctx, uploadService, logger)

	r := router.New(&router.Config{
		DB:             pool,
		SessionStore:   sessionStore,
		Redis:          sessionStore.Client(),
		AllowedOrigins: cfg.CORSAllowedOrigins,
		AuthHandler:    authHandler,
		HealthHandler:  healthHandler,
		PlayerHandler:  playerHandler,
		TeamHandler:    teamHandler,
		OrgHandler:     orgHandler,
		VenueHandler:   venueHandler,
		CourtHandler:   courtHandler,
		SecureCookie:   secureCookie,

		// Phase 3
		LeagueHandler:          leagueHandler,
		TournamentHandler:      tournamentHandler,
		TournamentStaffHandler: tournamentStaffHandler,
		DivisionHandler:        divisionHandler,
		RegistrationHandler:    registrationHandler,
		SeasonHandler:          seasonHandler,
		PodHandler:             podHandler,
		AnnouncementHandler:    announcementHandler,
		DivTemplateHandler:     divTemplateHandler,
		LeagueRegHandler:       leagueRegHandler,

		// Phase 4A
		ScoringPresetHandler: scoringPresetHandler,
		MatchHandler:         matchHandler,

		// Phase 4D
		BracketHandler:    bracketHandler,
		CourtQueueHandler: courtQueueHandler,

		// Phase 4E
		MatchSeriesHandler: matchSeriesHandler,
		QuickMatchHandler:  quickMatchHandler,

		// Phase 5
		OverlayHandler:       overlayHandler,
		SourceProfileHandler: sourceProfileHandler,

		// Phase 6
		StandingsHandler: standingsHandler,

		// Phase 7
		DashboardHandler: dashboardHandler,
		SearchHandler:    searchHandler,
		PublicHandler:    publicHandler,

		// Phase 8
		AdminHandler:  adminHandler,
		UploadHandler: uploadHandler,
		ApiKeySvc:     apiKeyService,
		AdHandler:     adHandler,

		// CMS Settings
		SettingsHandler: settingsHandler,

		// Phase 4C
		WSHandler: wsHandler.Routes(),

		// Logto Phase 3
		SportsHandler:  sportsHandler,
		ProfileHandler: profileHandler,
		JWTValidator:   jwtValidator,

		// Logto Phase 3 Task 9
		LogtoWebhookHandler: webhookHandler,
		LogtoClient:         logtoClient,
		UserSyncService:     userSyncService,
		Queries:             queries,

		// Mgmt-API-backed elevation: see api/middleware/org_role_resolver.go
		OrgRoles: orgRoleResolver,

		// Sport-scoped authz: RequireSportMatchesJWT confirms the JWT's
		// organization_id matches the X-Sport the request targets.
		SportResolver: sportResolver,
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		slog.Info("shutting down server")
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			slog.Error("server shutdown error", "error", err)
		}
	}()

	slog.Info("server starting", "port", cfg.Port, "env", cfg.Env)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}

	slog.Info("server stopped")
}
