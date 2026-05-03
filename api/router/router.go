// api/router/router.go
package router

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/handler"
	"github.com/court-command/court-command/logto"
	"github.com/court-command/court-command/middleware"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// Config holds the dependencies needed to build the router.
type Config struct {
	DB             *pgxpool.Pool
	SessionStore   *session.Store
	Redis          *redis.Client
	AllowedOrigins []string
	AuthHandler    *handler.AuthHandler
	HealthHandler  *handler.HealthHandler
	PlayerHandler  *handler.PlayerHandler
	TeamHandler    *handler.TeamHandler
	OrgHandler     *handler.OrgHandler
	VenueHandler   *handler.VenueHandler
	CourtHandler   *handler.CourtHandler
	SecureCookie   bool

	// Phase 3 handlers
	LeagueHandler          *handler.LeagueHandler
	TournamentHandler      *handler.TournamentHandler
	TournamentStaffHandler *handler.TournamentStaffHandler
	DivisionHandler        *handler.DivisionHandler
	RegistrationHandler    *handler.RegistrationHandler
	SeasonHandler          *handler.SeasonHandler
	PodHandler             *handler.PodHandler
	AnnouncementHandler    *handler.AnnouncementHandler
	DivTemplateHandler     *handler.DivisionTemplateHandler
	LeagueRegHandler       *handler.LeagueRegistrationHandler

	// Phase 4A handlers
	ScoringPresetHandler *handler.ScoringPresetHandler
	MatchHandler         *handler.MatchHandler

	// Phase 4D handlers
	BracketHandler    *handler.BracketHandler
	CourtQueueHandler *handler.CourtQueueHandler

	// Phase 4E handlers
	MatchSeriesHandler *handler.MatchSeriesHandler
	QuickMatchHandler  *handler.QuickMatchHandler

	// Phase 5: Overlay
	OverlayHandler       *handler.OverlayHandler
	SourceProfileHandler *handler.SourceProfileHandler

	// Phase 6: Standings
	StandingsHandler *handler.StandingsHandler

	// Phase 7: Public & Player Experience
	DashboardHandler *handler.DashboardHandler
	SearchHandler    *handler.SearchHandler
	PublicHandler    *handler.PublicHandler

	// Phase 8: Admin & Platform Management
	AdminHandler  *handler.AdminHandler
	UploadHandler *handler.UploadHandler

	// Phase 8: External API support
	ApiKeySvc *service.ApiKeyService

	// CMS Settings
	SettingsHandler *handler.SettingsHandler

	// Ads
	AdHandler *handler.AdHandler

	// Phase 4C: WebSocket
	WSHandler chi.Router

	// Logto Phase 3: public sport directory
	SportsHandler *handler.SportsHandler

	// Logto Phase 3: profile endpoints (JWT-protected, mounted under
	// /api/v1/me/profile). Optional in the Config so tests that don't
	// care about Logto wiring (almost all of them today) can leave it
	// nil and the routes simply don't register.
	ProfileHandler *handler.ProfileHandler
	JWTValidator   *auth.Validator

	// Logto Phase 3 Task 9: webhook + on-demand user mirror.
	//
	// LogtoWebhookHandler is mounted publicly at
	// /api/v1/webhooks/logto -- no auth middleware in front; the
	// HMAC signature on the Logto-Signature-Sha-256 header IS the
	// auth. Leaving it nil disables the route entirely (used by
	// testutil.TestServer where no Logto deps are wired).
	//
	// LogtoClient + UserSyncService + Queries together enable the
	// MirrorUser middleware on /api/v1/me/* protected routes. All
	// three must be non-nil for the middleware to be chained;
	// otherwise the routes still work but skip the on-demand
	// mirror (the webhook path will eventually populate the row,
	// at which point requests start succeeding).
	LogtoWebhookHandler *handler.LogtoWebhookHandler
	LogtoClient         *logto.Client
	UserSyncService     *service.UserSyncService
	Queries             *generated.Queries
}

// authMiddlewares returns the middleware chain that should gate
// authenticated route groups. In production (cfg.JWTValidator != nil)
// this is RequireJWT + JWTSession -- validates the Logto JWT and
// populates session.Data via on-demand mirror lookup, so existing
// handlers that read session.SessionData(r.Context()) continue working
// without code changes.
//
// In testutil/cookie-only environments (cfg.JWTValidator == nil) this
// falls back to the legacy RequireAuth(SessionStore) cookie path so
// existing test fixtures keep working.
//
// Phase 6 cutover will drop the cookie branch entirely.
func authMiddlewares(cfg *Config) []func(http.Handler) http.Handler {
	if cfg.JWTValidator != nil && cfg.LogtoClient != nil && cfg.UserSyncService != nil && cfg.Queries != nil {
		return []func(http.Handler) http.Handler{
			middleware.RequireJWT(cfg.JWTValidator, true),
			middleware.JWTSession(cfg.LogtoClient, cfg.Queries, cfg.UserSyncService),
		}
	}
	return []func(http.Handler) http.Handler{
		middleware.RequireAuth(cfg.SessionStore),
	}
}

// useAuth applies the chain returned by authMiddlewares to a chi
// router. Equivalent to r.Use(authMiddlewares(cfg)...) but a function
// so the call sites read more obviously.
func useAuth(r chi.Router, cfg *Config) {
	for _, mw := range authMiddlewares(cfg) {
		r.Use(mw)
	}
}

// New creates a chi.Router with all middleware and routes mounted.
func New(cfg *Config) chi.Router {
	r := chi.NewRouter()

	// Global middleware stack
	r.Use(middleware.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.StructuredLogger)
	r.Use(middleware.Recoverer)
	r.Use(chimw.CleanPath)
	r.Use(chimw.Timeout(60 * time.Second))
	r.Use(middleware.CORS(cfg.AllowedOrigins))
	r.Use(middleware.MaxBodySize(1 << 20))           // 1 MB default limit
	r.Use(middleware.OptionalAuth(cfg.SessionStore)) // Populate session data when cookie present
	// Phase 3.6 C1: OptionalJWT mirrors OptionalAuth for the JWT path.
	// Mixed-auth route groups (those mounted without an explicit
	// useAuth wrapper -- e.g. /leagues, /tournaments where reads are
	// public and writes do handler-level `if sess == nil { 401 }`)
	// rely on a global middleware to populate session.Data. Without
	// this, the SPA's JWT can never reach those handlers.
	if cfg.JWTValidator != nil && cfg.LogtoClient != nil && cfg.UserSyncService != nil && cfg.Queries != nil {
		r.Use(middleware.OptionalJWT(
			cfg.JWTValidator, cfg.LogtoClient, cfg.Queries, cfg.UserSyncService))
	}

	// API v1 routes
	r.Route("/api/v1", func(r chi.Router) {
		// Public routes (no auth required)
		r.Get("/health", cfg.HealthHandler.Check)

		// Sport directory (public — sport picker fetches this before the
		// user picks an org and gets a JWT, so no auth middleware here).
		if cfg.SportsHandler != nil {
			r.Get("/sports", cfg.SportsHandler.ListSports)
		}

		// Logto Phase 3: profile endpoints. Mounted under RequireJWT so
		// every request has a validated Logto access token in context
		// before reaching the handler. orgScoped=true because Phase 3
		// frontends call these with org-scoped tokens (urn:logto:org:*).
		// Task 9 will add MirrorUser middleware in this same group so
		// the local users.id is on the request context too.
		if cfg.ProfileHandler != nil && cfg.JWTValidator != nil {
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireJWT(cfg.JWTValidator, true))
				// Task 9: chain MirrorUser AFTER RequireJWT so the
				// local users row is guaranteed to exist for the
				// JWT subject before the handler runs. Conditional
				// because testutil.TestServer doesn't wire the
				// Logto deps; in that case we keep the legacy
				// behavior (handler resolves users.id directly via
				// ProfileService.LookupUserByLogtoSubject).
				if cfg.LogtoClient != nil && cfg.UserSyncService != nil && cfg.Queries != nil {
					r.Use(middleware.MirrorUser(cfg.LogtoClient, cfg.Queries, cfg.UserSyncService))
				}
				// Phase 3 fix: /api/v1/auth/me is now JWT-authenticated.
				// The legacy cookie-mounted /auth/me below is removed in
				// the same commit; the SPA only authenticates via JWT.
				r.Get("/auth/me", cfg.AuthHandler.MeJWT)
				r.Get("/me/profile", cfg.ProfileHandler.GetMyProfile)
				r.Patch("/me/profile", cfg.ProfileHandler.PatchMyProfile)
			})
		}

		// Logto webhook (public -- HMAC signature IS the auth).
		// Mounted under /api/v1 like every other API route so a
		// future API gateway / reverse proxy that path-routes on
		// /api/v1 catches this too.
		if cfg.LogtoWebhookHandler != nil {
			r.Post("/webhooks/logto", cfg.LogtoWebhookHandler.Handle)
		}

		// Auth routes. /register, /login, /logout stay on the cookie
		// path until Phase 6 cutover deletes them. /auth/me is mounted
		// on the JWT-protected block above when the JWT validator is
		// configured (production); when it's nil (testutil.TestServer
		// for legacy cookie-only tests), we fall back to the
		// cookie-session Me handler here so existing tests that exercise
		// the login -> /me flow keep working.
		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", cfg.AuthHandler.Register)
			r.Post("/login", cfg.AuthHandler.Login)
			r.Post("/logout", cfg.AuthHandler.Logout)

			// Authenticated /auth/* sub-routes. Use the same JWT/cookie
			// auth chain as the rest of the app so the SPA's JWT
			// reaches MyTournamentStaff (Phase 3 fix C6).
			//
			// /auth/me itself is mounted in the dedicated Phase 3 JWT
			// block above when JWTValidator is configured. When it's
			// nil (testutil mode), authMiddlewares falls back to the
			// cookie path and we mount the legacy /me here too.
			r.Group(func(r chi.Router) {
				useAuth(r, cfg)
				if cfg.JWTValidator == nil {
					// Legacy fallback for testutil/cookie-only environments.
					// Phase 6 cutover deletes this branch entirely.
					r.Get("/me", cfg.AuthHandler.Me)
				}
				r.Get("/me/tournament-staff", cfg.AuthHandler.MyTournamentStaff)
			})
		})

		// Player routes (authenticated)
		r.Route("/players", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.PlayerHandler.Routes())
		})

		// Team routes (authenticated)
		r.Route("/teams", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.TeamHandler.Routes())
		})

		// Organization routes (authenticated)
		r.Route("/organizations", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.OrgHandler.Routes())
		})

		// Venue routes (authenticated)
		r.Route("/venues", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.VenueHandler.Routes())
		})

		// Court routes (authenticated — standalone/floating courts)
		r.Route("/courts", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.CourtHandler.Routes())
		})

		// --- Phase 3 routes ---

		// League routes (mixed auth: public reads, handler-level auth on writes)
		r.Route("/leagues", func(r chi.Router) {
			r.Mount("/", cfg.LeagueHandler.Routes())

			// League sub-resources (auth checked by handlers)
			r.Route("/{leagueID}/seasons", func(r chi.Router) {
				r.Mount("/", cfg.SeasonHandler.Routes())
			})
			r.Route("/{leagueID}/division-templates", func(r chi.Router) {
				useAuth(r, cfg)
				r.Mount("/", cfg.DivTemplateHandler.Routes())
			})
			r.Route("/{leagueID}/announcements", func(r chi.Router) {
				r.Mount("/", cfg.AnnouncementHandler.LeagueAnnouncementRoutes())
			})
			r.Route("/{leagueID}/registrations", func(r chi.Router) {
				useAuth(r, cfg)
				r.Mount("/", cfg.LeagueRegHandler.Routes())
			})
		})

		// Tournament routes (mixed auth: public reads, handler-level auth on writes)
		r.Route("/tournaments", func(r chi.Router) {
			r.Mount("/", cfg.TournamentHandler.Routes())

			// Tournament sub-resources (auth checked by handlers)
			r.Route("/{tournamentID}/divisions", func(r chi.Router) {
				r.Mount("/", cfg.DivisionHandler.Routes())
			})
			r.Route("/{tournamentID}/announcements", func(r chi.Router) {
				r.Mount("/", cfg.AnnouncementHandler.TournamentAnnouncementRoutes())
			})
			// Tournament courts: list, assign, create temp, unassign
			r.Get("/{tournamentID}/courts", cfg.CourtHandler.ListCourtsByTournament)
			r.Post("/{tournamentID}/courts", cfg.CourtHandler.AssignCourtToTournament)
			r.Post("/{tournamentID}/courts/temp", cfg.CourtHandler.CreateTempCourtForTournament)
			r.Delete("/{tournamentID}/courts/{courtID}", cfg.CourtHandler.UnassignCourtFromTournament)
			r.Route("/{tournamentID}/staff", func(r chi.Router) {
				r.Mount("/", cfg.TournamentStaffHandler.Routes())
			})
		})

		// Flat announcement routes at /api/v1/announcements/{announcementID}
		// Mirrors the nested tournament/league routes so callers that only hold
		// an announcement ID don't need the parent scope in the URL.
		r.Route("/announcements", func(r chi.Router) {
			r.Mount("/", cfg.AnnouncementHandler.FlatAnnouncementRoutes())
		})

		// Division sub-resources (registrations and pods — auth checked by handlers)
		r.Route("/divisions/{divisionID}/registrations", func(r chi.Router) {
			r.Mount("/", cfg.RegistrationHandler.Routes())
		})
		r.Route("/divisions/{divisionID}/pods", func(r chi.Router) {
			r.Mount("/", cfg.PodHandler.Routes())
		})

		// Division-scoped matches
		r.Route("/divisions/{divisionID}/matches", func(r chi.Router) {
			r.Mount("/", cfg.MatchHandler.DivisionRoutes())
		})

		// --- Phase 4A routes ---

		// Scoring presets (mixed auth: public reads, handler-level auth on writes)
		r.Route("/scoring-presets", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.ScoringPresetHandler.Routes())
		})

		// Matches: split auth posture within a single sub-router. Public reads
		// for the spectator scoreboard (GET /public/{publicID} and
		// /public/{publicID}/events) must NOT sit behind RequireAuth because
		// /matches/{publicId} and /matches/{publicId}/scoreboard are public
		// frontend routes. Everything else is authenticated. Chi only allows
		// one Mount per path, so the public GETs are registered directly on
		// this node via handler methods and the authed subtree uses a Group.
		r.Route("/matches", func(r chi.Router) {
			// Public reads (no auth).
			r.Get("/public/{publicID}", cfg.MatchHandler.GetByPublicID)
			r.Get("/public/{publicID}/events", cfg.MatchHandler.GetMatchEventsByPublicID)

			// Authenticated writes/reads.
			r.Group(func(r chi.Router) {
				useAuth(r, cfg)
				r.Mount("/", cfg.MatchHandler.Routes())
			})
		})

		// Court-scoped matches
		r.Route("/courts/{courtID}/matches", func(r chi.Router) {
			r.Mount("/", cfg.MatchHandler.CourtRoutes())
		})

		// --- Phase 4D routes ---

		// Bracket generation (authenticated)
		r.Route("/divisions/{divisionID}/bracket", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.BracketHandler.Routes())
		})

		// Court queue (mixed: GET public, writes authenticated by handler)
		r.Route("/courts/{courtID}/queue", func(r chi.Router) {
			r.Mount("/", cfg.CourtQueueHandler.Routes())
		})

		// Team-scoped matches
		r.Route("/teams/{teamID}/matches", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.MatchHandler.TeamRoutes())
		})

		// --- Phase 4E routes ---

		// Match series: split auth posture. Public reads for broadcast
		// overlay and spectator views must NOT sit behind RequireAuth.
		r.Route("/match-series", func(r chi.Router) {
			// Public reads (no auth) — registered directly like /matches.
			r.Get("/public/{publicID}", cfg.MatchSeriesHandler.GetByPublicID)

			// Authenticated writes/reads.
			r.Group(func(r chi.Router) {
				useAuth(r, cfg)
				r.Mount("/", cfg.MatchSeriesHandler.Routes())
			})
		})

		// Division-scoped match series
		r.Route("/divisions/{divisionID}/match-series", func(r chi.Router) {
			r.Mount("/", cfg.MatchSeriesHandler.DivisionRoutes())
		})

		// Quick matches (authenticated)
		r.Route("/quick-matches", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.QuickMatchHandler.Routes())
		})

		// --- Phase 6 routes ---

		// Standings (mixed auth: public reads, handler-level auth on writes)
		r.Route("/standings", func(r chi.Router) {
			r.Mount("/", cfg.StandingsHandler.Routes())
		})

		// --- Phase 7 routes ---

		// Player dashboard (authenticated)
		r.Route("/dashboard", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.DashboardHandler.Routes())
		})

		// Global search (public)
		r.Route("/search", func(r chi.Router) {
			r.Mount("/", cfg.SearchHandler.Routes())
		})

		// Public directory (no auth)
		r.Route("/public", func(r chi.Router) {
			r.Mount("/", cfg.PublicHandler.Routes())
		})

		// --- Phase 5 routes ---

		// Overlay routes (mixed public and authenticated)
		r.Route("/overlay", func(r chi.Router) {
			// Public routes (overlay data, themes, demo, webhook, slug resolution)
			r.Get("/court/{courtID}/data", cfg.OverlayHandler.GetOverlayData)
			r.Get("/court/{courtID}/resolve", cfg.OverlayHandler.ResolveCourtSlug)
			r.Get("/themes", cfg.OverlayHandler.ListThemes)
			r.Get("/themes/{themeID}", cfg.OverlayHandler.GetTheme)
			r.Get("/demo-data", cfg.OverlayHandler.GetDemoData)
			r.Post("/webhook/{courtID}", cfg.OverlayHandler.ReceiveWebhook)

			// Authenticated control panel routes
			r.Group(func(r chi.Router) {
				useAuth(r, cfg)
				r.Get("/court/{courtID}/config", cfg.OverlayHandler.GetConfig)
				r.Put("/court/{courtID}/config/theme", cfg.OverlayHandler.UpdateTheme)
				r.Put("/court/{courtID}/config/elements", cfg.OverlayHandler.UpdateElements)
				r.Post("/court/{courtID}/config/token/generate", cfg.OverlayHandler.GenerateToken)
				r.Delete("/court/{courtID}/config/token", cfg.OverlayHandler.RevokeToken)
				r.Put("/court/{courtID}/config/source-profile", cfg.OverlayHandler.SetSourceProfile)
				r.Put("/court/{courtID}/config/data-overrides", cfg.OverlayHandler.UpdateDataOverrides)
				r.Delete("/court/{courtID}/config/data-overrides", cfg.OverlayHandler.ClearDataOverrides)
			})
		})

		// Source Profile routes (authenticated)
		r.Route("/source-profiles", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.SourceProfileHandler.Routes())
		})

		// --- Phase 8 routes ---

		// Stop impersonation — must be OUTSIDE admin group because
		// the impersonated session has the target user's role (not platform_admin)
		r.Route("/admin/stop-impersonation", func(r chi.Router) {
			useAuth(r, cfg)
			r.Post("/", cfg.AdminHandler.StopImpersonation)
		})

		// Admin routes (authenticated + platform_admin only)
		r.Route("/admin", func(r chi.Router) {
			useAuth(r, cfg)
			r.Use(middleware.RequirePlatformAdmin)
			r.Mount("/", cfg.AdminHandler.Routes())
			if cfg.AdHandler != nil {
				r.Mount("/ads", cfg.AdHandler.AdminRoutes())
			}
			if cfg.SettingsHandler != nil {
				r.Get("/settings", cfg.SettingsHandler.GetAll)
				r.Put("/settings", cfg.SettingsHandler.Update)
			}
		})

		// Public settings endpoints (no auth)
		if cfg.SettingsHandler != nil {
			r.Get("/settings/ghost", cfg.SettingsHandler.GetGhostConfig)
			r.Get("/settings/google-maps", cfg.SettingsHandler.GetGoogleMapsConfig)
		}

		// Public ads endpoint (active ads only, no auth)
		if cfg.AdHandler != nil {
			r.Mount("/ads", cfg.AdHandler.PublicRoutes())
		}

		// Upload routes (authenticated)
		r.Route("/uploads", func(r chi.Router) {
			useAuth(r, cfg)
			r.Mount("/", cfg.UploadHandler.Routes())
		})

		// External API routes (API key auth + rate limiting)
		r.Route("/external", func(r chi.Router) {
			r.Use(middleware.ApiKeyAuth(cfg.ApiKeySvc))
			r.Use(middleware.RateLimit(60, 60, time.Minute))
			r.Get("/health", cfg.HealthHandler.Check)
		})
	})

	// Serve uploaded files as static assets (no directory listing)
	r.Route("/uploads", func(r chi.Router) {
		r.Get("/{filename}", func(w http.ResponseWriter, req *http.Request) {
			filename := chi.URLParam(req, "filename")
			// Prevent path traversal
			if strings.Contains(filename, "/") || strings.Contains(filename, "..") {
				http.NotFound(w, req)
				return
			}
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Content-Disposition", "inline")
			http.ServeFile(w, req, "uploads/"+filename)
		})
	})

	// WebSocket routes (outside API versioning — protocol is inherently versioned)
	if cfg.WSHandler != nil {
		r.Mount("/ws", cfg.WSHandler)
	}

	return r
}
