package service

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/overlay"
	"github.com/court-command/court-command/pubsub"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// OverlayService manages overlay configurations.
type OverlayService struct {
	pool     *pgxpool.Pool
	queries  *generated.Queries
	resolver *overlay.Resolver
	ps       *pubsub.PubSub
}

// NewOverlayService creates a new OverlayService.
func NewOverlayService(pool *pgxpool.Pool, queries *generated.Queries, resolver *overlay.Resolver, ps *pubsub.PubSub) *OverlayService {
	return &OverlayService{pool: pool, queries: queries, resolver: resolver, ps: ps}
}

// GetOrCreateConfig returns the overlay config for a court, creating a default one if it doesn't exist.
func (s *OverlayService) GetOrCreateConfig(ctx context.Context, courtID int64) (generated.CourtOverlayConfig, error) {
	config, err := s.queries.GetOverlayConfigByCourtID(ctx, courtID)
	if err == nil {
		return config, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return generated.CourtOverlayConfig{}, fmt.Errorf("get overlay config: %w", err)
	}

	// Not found — create default config
	defaultElements, _ := json.Marshal(map[string]interface{}{
		"scoreboard":       map[string]interface{}{"visible": true, "auto_animate": true},
		"lower_third":      map[string]interface{}{"visible": false, "auto_animate": true},
		"player_card":      map[string]interface{}{"visible": false, "auto_animate": true, "auto_dismiss_seconds": 10},
		"team_card":        map[string]interface{}{"visible": false, "auto_animate": true, "auto_dismiss_seconds": 10},
		"sponsor_bug":      map[string]interface{}{"visible": false, "auto_animate": true, "rotation_seconds": 15, "logos": []interface{}{}},
		"tournament_bug":   map[string]interface{}{"visible": true, "auto_animate": true},
		"coming_up_next":   map[string]interface{}{"visible": false, "auto_animate": true},
		"match_result":     map[string]interface{}{"visible": false, "auto_animate": true, "auto_show_delay_seconds": 5, "auto_dismiss_seconds": 30},
		"custom_text":      map[string]interface{}{"visible": false, "auto_animate": true, "text": "", "auto_dismiss_seconds": 0},
		"bracket_snapshot": map[string]interface{}{"visible": false, "auto_animate": true},
		"pool_standings":   map[string]interface{}{"visible": false, "auto_animate": true},
		"series_score":     map[string]interface{}{"visible": false, "auto_animate": true},
	})

	config, err = s.queries.CreateOverlayConfig(ctx, generated.CreateOverlayConfigParams{
		CourtID:                 courtID,
		ThemeID:                 "classic",
		ColorOverrides:          []byte("{}"),
		Elements:                defaultElements,
		ShowBranding:            true,
		MatchResultDelaySeconds: 30,
		IdleDisplay:             "court_name",
		DataOverrides:           []byte("{}"),
	})
	if err != nil {
		return generated.CourtOverlayConfig{}, fmt.Errorf("create default overlay config: %w", err)
	}

	return config, nil
}

// UpdateTheme updates the theme and color overrides for a court's overlay.
func (s *OverlayService) UpdateTheme(ctx context.Context, courtID int64, themeID string, colorOverrides json.RawMessage) (generated.CourtOverlayConfig, error) {
	// Validate theme exists — GetTheme falls back to classic, so compare the returned ID
	theme := overlay.GetTheme(themeID)
	if theme.ID != themeID {
		return generated.CourtOverlayConfig{}, &ValidationError{Message: fmt.Sprintf("unknown theme: %s", themeID)}
	}

	if colorOverrides == nil {
		colorOverrides = []byte("{}")
	}

	config, err := s.queries.UpdateOverlayTheme(ctx, generated.UpdateOverlayThemeParams{
		CourtID:        courtID,
		ThemeID:        themeID,
		ColorOverrides: colorOverrides,
	})
	if err != nil {
		return generated.CourtOverlayConfig{}, fmt.Errorf("update theme: %w", err)
	}

	// Broadcast config change
	s.broadcastConfigChange(ctx, courtID, config)

	return config, nil
}

// UpdateElements updates the element visibility/settings for a court's overlay.
func (s *OverlayService) UpdateElements(ctx context.Context, courtID int64, elements json.RawMessage) (generated.CourtOverlayConfig, error) {
	config, err := s.queries.UpdateOverlayElements(ctx, generated.UpdateOverlayElementsParams{
		CourtID:  courtID,
		Elements: elements,
	})
	if err != nil {
		return generated.CourtOverlayConfig{}, fmt.Errorf("update elements: %w", err)
	}

	s.broadcastConfigChange(ctx, courtID, config)

	return config, nil
}

// GenerateToken generates a new overlay access token for a court.
func (s *OverlayService) GenerateToken(ctx context.Context, courtID int64) (generated.CourtOverlayConfig, error) {
	token, err := generateSecureToken()
	if err != nil {
		return generated.CourtOverlayConfig{}, fmt.Errorf("generate token: %w", err)
	}

	config, err := s.queries.UpdateOverlayToken(ctx, generated.UpdateOverlayTokenParams{
		CourtID:      courtID,
		OverlayToken: &token,
	})
	if err != nil {
		return generated.CourtOverlayConfig{}, fmt.Errorf("update token: %w", err)
	}

	return config, nil
}

// RevokeToken removes the overlay access token for a court (makes overlay fully public).
func (s *OverlayService) RevokeToken(ctx context.Context, courtID int64) (generated.CourtOverlayConfig, error) {
	config, err := s.queries.UpdateOverlayToken(ctx, generated.UpdateOverlayTokenParams{
		CourtID:      courtID,
		OverlayToken: nil,
	})
	if err != nil {
		return generated.CourtOverlayConfig{}, fmt.Errorf("revoke token: %w", err)
	}

	return config, nil
}

// ValidateToken checks if the provided token matches the court's overlay token.
// Returns nil if valid, error if invalid. If no token is set on the config, any access is allowed.
func (s *OverlayService) ValidateToken(ctx context.Context, courtID int64, token string) error {
	config, err := s.queries.GetOverlayConfigByCourtID(ctx, courtID)
	if err != nil {
		// No config means no token restriction — allow access
		return nil
	}

	// If no token set, overlay is public
	if config.OverlayToken == nil {
		return nil
	}

	// Token required but not provided
	if token == "" {
		return errors.New("overlay token required")
	}

	// Constant-time comparison to prevent timing side-channel attacks
	if subtle.ConstantTimeCompare([]byte(*config.OverlayToken), []byte(token)) != 1 {
		return errors.New("invalid overlay token")
	}

	return nil
}

// SetSourceProfile links a source profile to a court's overlay config.
func (s *OverlayService) SetSourceProfile(ctx context.Context, courtID int64, sourceProfileID *int64) (generated.CourtOverlayConfig, error) {
	var spID pgtype.Int8
	if sourceProfileID != nil {
		spID = pgtype.Int8{Int64: *sourceProfileID, Valid: true}
	}

	config, err := s.queries.UpdateOverlaySourceProfile(ctx, generated.UpdateOverlaySourceProfileParams{
		CourtID:         courtID,
		SourceProfileID: spID,
	})
	if err != nil {
		return generated.CourtOverlayConfig{}, fmt.Errorf("set source profile: %w", err)
	}

	s.broadcastConfigChange(ctx, courtID, config)

	return config, nil
}

// UpdateDataOverrides updates the per-court field-level data overrides.
// Overrides are applied on top of resolved overlay data before rendering.
// Keys match canonical OverlayData JSON field names (e.g. "team_1_name", "division_name").
func (s *OverlayService) UpdateDataOverrides(ctx context.Context, courtID int64, overrides json.RawMessage) (generated.CourtOverlayConfig, error) {
	if overrides == nil {
		overrides = []byte("{}")
	}

	config, err := s.queries.UpdateOverlayDataOverrides(ctx, generated.UpdateOverlayDataOverridesParams{
		CourtID:       courtID,
		DataOverrides: overrides,
	})
	if err != nil {
		return generated.CourtOverlayConfig{}, fmt.Errorf("update data overrides: %w", err)
	}

	s.broadcastConfigChange(ctx, courtID, config)

	return config, nil
}

// ClearDataOverrides resets all per-court data overrides to empty.
func (s *OverlayService) ClearDataOverrides(ctx context.Context, courtID int64) (generated.CourtOverlayConfig, error) {
	return s.UpdateDataOverrides(ctx, courtID, []byte("{}"))
}

// GetOverlayData returns the canonical overlay data for a court.
// Resolution order:
//  1. If `useDemoData` is set, short-circuit to the seeded DemoData payload.
//     This makes the demo toggle authoritative — operators can flip the
//     preview to mock content even while a live match is in progress so
//     they can style elements against a fully-populated canvas.
//  2. Otherwise, if the court has an active match, resolve from match data.
//  3. Otherwise, fall back to idle data.
//
// Per-court data_overrides are applied on top of whichever base data was
// resolved, so overrides still shape demo previews (useful for testing
// override behaviour without a live match).
func (s *OverlayService) GetOverlayData(ctx context.Context, courtID int64, useDemoData bool) (overlay.OverlayData, error) {
	var data overlay.OverlayData

	if useDemoData {
		data = overlay.DemoData()
	} else {
		match, err := s.queries.GetActiveMatchOnCourt(ctx, pgtype.Int8{Int64: courtID, Valid: true})
		if err == nil {
			data, err = s.resolver.ResolveFromMatch(ctx, match)
			if err != nil {
				return overlay.OverlayData{}, err
			}
		} else {
			data = s.resolver.ResolveIdle(ctx, courtID)
		}
	}

	// Apply per-court data overrides if any are configured
	config, err := s.queries.GetOverlayConfigByCourtID(ctx, courtID)
	if err == nil && len(config.DataOverrides) > 0 {
		overlay.ApplyDataOverrides(&data, config.DataOverrides)
	}

	return data, nil
}

// BroadcastOverlayData broadcasts overlay data to the overlay WS channel for a court.
func (s *OverlayService) BroadcastOverlayData(ctx context.Context, courtID int64, data overlay.OverlayData) {
	if s.ps == nil {
		return
	}
	channel := pubsub.OverlayChannel(courtID)
	_ = s.ps.Publish(ctx, channel, "overlay_data", data)
}

func (s *OverlayService) broadcastConfigChange(ctx context.Context, courtID int64, config generated.CourtOverlayConfig) {
	if s.ps == nil {
		return
	}
	channel := pubsub.OverlayChannel(courtID)
	_ = s.ps.Publish(ctx, channel, "config_update", ToOverlayConfigResponse(config))
}

// ResolveCourtIDBySlug looks up a court by its slug and returns its numeric ID.
// Slugs are unique per-venue but not globally, so this returns the first active
// match ordered by ID (deterministic, lowest-ID wins). Returns NotFoundError
// when no court matches the slug.
func (s *OverlayService) ResolveCourtIDBySlug(ctx context.Context, slug string) (int64, error) {
	var courtID int64
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM courts WHERE slug = $1 AND deleted_at IS NULL ORDER BY id LIMIT 1`,
		slug,
	).Scan(&courtID)
	if err != nil {
		return 0, &NotFoundError{Message: fmt.Sprintf("court not found for slug: %s", slug)}
	}
	return courtID, nil
}

// GetCourtSlug returns the slug for a court by its numeric ID.
// Returns NotFoundError when the court doesn't exist.
func (s *OverlayService) GetCourtSlug(ctx context.Context, courtID int64) (string, error) {
	var slug string
	err := s.pool.QueryRow(ctx,
		`SELECT slug FROM courts WHERE id = $1 AND deleted_at IS NULL`,
		courtID,
	).Scan(&slug)
	if err != nil {
		return "", &NotFoundError{Message: "court not found"}
	}
	return slug, nil
}

// CanManageCourt reports whether the given user may manage the overlay
// configuration for a court. Returns true for platform admins, the court's
// creator, or a manager of the court's owning venue. Mirrors
// VenueService.CanManageVenue so the same ownership boundary that gates venue
// and court mutations also gates overlay control-panel writes. Returns
// NotFoundError when the court does not exist.
func (s *OverlayService) CanManageCourt(ctx context.Context, courtID, userID int64, userRole string) (bool, error) {
	if userRole == "platform_admin" {
		return true, nil
	}

	court, err := s.queries.GetCourtByID(ctx, courtID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, &NotFoundError{Message: "court not found"}
		}
		return false, fmt.Errorf("get court for authorization: %w", err)
	}

	// The court creator may always manage it.
	if court.CreatedByUserID.Valid && court.CreatedByUserID.Int64 == userID {
		return true, nil
	}

	// Otherwise, the caller must be a manager of the court's owning venue.
	if court.VenueID.Valid {
		isMgr, err := s.queries.IsVenueManager(ctx, generated.IsVenueManagerParams{
			VenueID: court.VenueID.Int64,
			UserID:  userID,
		})
		if err != nil {
			return false, fmt.Errorf("check venue manager for court authorization: %w", err)
		}
		if isMgr {
			return true, nil
		}
	}

	return false, nil
}

func generateSecureToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
