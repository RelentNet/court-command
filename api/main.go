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
	"github.com/court-command/court-command/overlay"
	"github.com/court-command/court-command/pubsub"
	"github.com/court-command/court-command/router"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
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
	adminHandler := handler.NewAdminHandler(queries, activityLogService, apiKeyService, sessionStore, uploadService)
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
		os.Getenv("LOGTO_WEBHOOK_SIGNING_KEY"),
	)

	var logtoClient *logto.Client
	mgmtAppID := os.Getenv("LOGTO_MANAGEMENT_API_APP_ID")
	mgmtAppSecret := os.Getenv("LOGTO_MANAGEMENT_API_APP_SECRET")
	mgmtResource := os.Getenv("LOGTO_MANAGEMENT_API_RESOURCE")
	if logtoEndpoint != "" && mgmtAppID != "" && mgmtAppSecret != "" && mgmtResource != "" {
		logtoClient = logto.NewClient(logto.Config{
			Endpoint:               logtoEndpoint,
			ManagementAPIAppID:     mgmtAppID,
			ManagementAPIAppSecret: mgmtAppSecret,
			ManagementAPIResource:  mgmtResource,
		})
	} else {
		// Phase 3.5 fix (review I1): in production, missing Logto
		// Mgmt API config is a deployment foot-gun -- the auth chain
		// silently degrades to cookie-only and the SPA's first
		// post-signup request 404s. Fail fast in production so the
		// operator sees the misconfiguration immediately.
		if cfg.Env == "production" {
			slog.Error("Logto Management API env vars are required in production",
				"missing_endpoint", logtoEndpoint == "",
				"missing_app_id", mgmtAppID == "",
				"missing_app_secret", mgmtAppSecret == "",
				"missing_resource", mgmtResource == "")
			os.Exit(1)
		}
		slog.Warn("Logto Management API env vars missing; on-demand user mirror disabled (dev only)")
	}

	// Phase 4C: WebSocket handler
	wsHandler := ws.NewHandler(ps, logger)

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
