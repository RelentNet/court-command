package testutil

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/handler"
	"github.com/court-command/court-command/overlay"
	"github.com/court-command/court-command/router"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestServerWithAdmin creates an httptest.Server and a platform_admin session cookie.
// It registers a user, promotes them to platform_admin, logs in to get a session
// with the admin role, and returns (server, cookieHeader).
func TestServerWithAdmin(t *testing.T, pool *pgxpool.Pool) (*httptest.Server, string) {
	t.Helper()

	ts := TestServer(t, pool)

	// Register a user via the API
	regBody := `{"email":"admin@test.com","password":"password123","first_name":"Admin","last_name":"Test","date_of_birth":"1990-01-01"}`
	regResp, err := http.Post(ts.URL+"/api/v1/auth/register", "application/json", strings.NewReader(regBody))
	if err != nil {
		t.Fatalf("TestServerWithAdmin: register request failed: %v", err)
	}
	regResp.Body.Close()
	if regResp.StatusCode != 201 {
		t.Fatalf("TestServerWithAdmin: register expected 201, got %d", regResp.StatusCode)
	}

	// Promote to platform_admin in the database
	_, err = pool.Exec(context.Background(), `UPDATE users SET role = 'platform_admin' WHERE email = 'admin@test.com'`)
	if err != nil {
		t.Fatalf("TestServerWithAdmin: promote to admin: %v", err)
	}

	// Login to get a session with the admin role
	loginBody := `{"email":"admin@test.com","password":"password123"}`
	loginResp, err := http.Post(ts.URL+"/api/v1/auth/login", "application/json", strings.NewReader(loginBody))
	if err != nil {
		t.Fatalf("TestServerWithAdmin: login request failed: %v", err)
	}
	loginResp.Body.Close()
	if loginResp.StatusCode != 200 {
		t.Fatalf("TestServerWithAdmin: login expected 200, got %d", loginResp.StatusCode)
	}

	var cookieHeader string
	for _, c := range loginResp.Cookies() {
		if c.Name == "cc_session" {
			cookieHeader = c.Name + "=" + c.Value
			break
		}
	}
	if cookieHeader == "" {
		t.Fatal("TestServerWithAdmin: no session cookie returned after login")
	}

	return ts, cookieHeader
}

// TestServer creates an httptest.Server wired with all real dependencies.
// Uses Redis DB 1 to avoid colliding with dev data.
func TestServer(t *testing.T, pool *pgxpool.Pool) *httptest.Server {
	t.Helper()

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/1" // Use DB 1 for tests
	}

	store, err := session.NewStore(redisURL)
	if err != nil {
		t.Fatalf("creating session store: %v", err)
	}

	queries := generated.New(pool)

	// Phase 1+2 services
	authService := service.NewAuthService(pool, store)
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

	// Phase 4A services
	scoringPresetService := service.NewScoringPresetService(queries)
	matchService := service.NewMatchService(queries, pool, nil, nil)
	venueService.SetMatchService(matchService)

	// Phase 4D services
	bracketService := service.NewBracketService(queries, pool)
	courtQueueService := service.NewCourtQueueService(queries, pool, nil)

	// Phase 1+2 handlers
	authHandler := handler.NewAuthHandler(authService, false)
	healthHandler := handler.NewHealthHandler(pool, store.Client())
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
	matchSeriesService := service.NewMatchSeriesService(queries, pool, nil)
	matchSeriesHandler := handler.NewMatchSeriesHandler(matchSeriesService)
	quickMatchHandler := handler.NewQuickMatchHandler(matchService)

	// Phase 6: Standings
	standingsService := service.NewStandingsService(queries)
	standingsHandler := handler.NewStandingsHandler(standingsService)

	// Phase 7: Public & Player Experience
	dashboardService := service.NewDashboardService(queries)
	searchService := service.NewSearchService(queries)

	// Phase 5: Overlay (pass nil for pubsub in tests)
	overlayResolver := overlay.NewResolver(queries, nil)
	overlayService := service.NewOverlayService(pool, queries, overlayResolver, nil)
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
	uploadService := service.NewUploadService(queries, t.TempDir())
	// nil logtoClient: testutil runs the cookie-only path with no Logto Mgmt
	// API; the JWT impersonation endpoint 503s here, which tests don't exercise.
	adminHandler := handler.NewAdminHandler(queries, activityLogService, apiKeyService, store, uploadService, nil)
	uploadHandler := handler.NewUploadHandler(uploadService)

	// CMS Settings
	settingsService := service.NewSettingsService(pool)
	settingsHandler := handler.NewSettingsHandler(settingsService)

	// Logto Phase 3: public sport directory
	sportsService := service.NewSportsService(queries)
	sportsHandler := handler.NewSportsHandler(sportsService)

	r := router.New(&router.Config{
		DB:             pool,
		SessionStore:   store,
		Redis:          store.Client(),
		AllowedOrigins: []string{"http://localhost:5173"},
		AuthHandler:    authHandler,
		HealthHandler:  healthHandler,
		PlayerHandler:  playerHandler,
		TeamHandler:    teamHandler,
		OrgHandler:     orgHandler,
		VenueHandler:   venueHandler,
		CourtHandler:   courtHandler,
		SecureCookie:   false,

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

		// CMS Settings
		SettingsHandler: settingsHandler,

		// Logto Phase 3
		SportsHandler: sportsHandler,
	})

	ts := httptest.NewServer(r)

	t.Cleanup(func() {
		ts.Close()
		store.Close()
	})

	return ts
}
