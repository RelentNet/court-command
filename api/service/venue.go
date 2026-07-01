// api/service/venue.go
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/court-command/court-command/db/generated"
)

// VenueService handles venue and court business logic.
type VenueService struct {
	queries      *generated.Queries
	matchService *MatchService // optional; enables enriched court→match nesting
}

// NewVenueService creates a new VenueService.
func NewVenueService(queries *generated.Queries) *VenueService {
	return &VenueService{queries: queries}
}

// SetMatchService wires a MatchService so that list methods that embed
// match summaries (ListCourtsByTournament) can return the fully-enriched
// MatchResponse shape. Callers that don't wire this get the flat shape.
func (s *VenueService) SetMatchService(m *MatchService) {
	s.matchService = m
}

// VenueResponse is the public representation of a venue.
type VenueResponse struct {
	ID               int64           `json:"id"`
	Name             string          `json:"name"`
	Slug             string          `json:"slug"`
	Status           string          `json:"status"`
	AddressLine1     *string         `json:"address_line_1,omitempty"`
	AddressLine2     *string         `json:"address_line_2,omitempty"`
	City             *string         `json:"city,omitempty"`
	StateProvince    *string         `json:"state_province,omitempty"`
	Country          *string         `json:"country,omitempty"`
	PostalCode       *string         `json:"postal_code,omitempty"`
	FormattedAddress *string         `json:"formatted_address,omitempty"`
	Latitude         *float64        `json:"latitude,omitempty"`
	Longitude        *float64        `json:"longitude,omitempty"`
	Timezone         *string         `json:"timezone,omitempty"`
	WebsiteURL       *string         `json:"website_url,omitempty"`
	ContactEmail     *string         `json:"contact_email,omitempty"`
	ContactPhone     *string         `json:"contact_phone,omitempty"`
	LogoURL          *string         `json:"logo_url,omitempty"`
	PhotoURL         *string         `json:"photo_url,omitempty"`
	VenueMapURL      *string         `json:"venue_map_url,omitempty"`
	Description      *string         `json:"description,omitempty"`
	SurfaceTypes     json.RawMessage `json:"surface_types"`
	Amenities        json.RawMessage `json:"amenities"`
	OrgID            *int64          `json:"org_id,omitempty"`
	ManagedByUserID  *int64          `json:"managed_by_user_id,omitempty"`
	Bio              *string         `json:"bio,omitempty"`
	Notes            *string         `json:"notes,omitempty"`
	CreatedByUserID  int64           `json:"created_by_user_id"`
	CourtCount       int64           `json:"court_count"`
	CreatedAt        string          `json:"created_at"`
	UpdatedAt        string          `json:"updated_at"`
}

// CourtResponse is the public representation of a court.
// ActiveMatch and OnDeckMatch are best-effort enrichments populated by
// ListCourtsByTournament; they stay nil for callers that don't enrich.
type CourtResponse struct {
	ID              int64          `json:"id"`
	Name            string         `json:"name"`
	Slug            string         `json:"slug"`
	VenueID         *int64         `json:"venue_id,omitempty"`
	VenueName       *string        `json:"venue_name,omitempty"`
	SurfaceType     *string        `json:"surface_type,omitempty"`
	IsShowCourt     bool           `json:"is_show_court"`
	IsActive        bool           `json:"is_active"`
	IsTemporary     bool           `json:"is_temporary"`
	SortOrder       int32          `json:"sort_order"`
	Notes           *string        `json:"notes,omitempty"`
	StreamURL       *string        `json:"stream_url,omitempty"`
	StreamType      *string        `json:"stream_type,omitempty"`
	StreamIsLive    bool           `json:"stream_is_live"`
	StreamTitle     *string        `json:"stream_title,omitempty"`
	CreatedByUserID *int64         `json:"created_by_user_id,omitempty"`
	ActiveMatch     *MatchResponse `json:"active_match,omitempty"`
	OnDeckMatch     *MatchResponse `json:"on_deck_match,omitempty"`
	CreatedAt       string         `json:"created_at"`
	UpdatedAt       string         `json:"updated_at"`
}

func toVenueResponse(v generated.Venue, courtCount int64) VenueResponse {
	resp := VenueResponse{
		ID:               v.ID,
		Name:             v.Name,
		Slug:             v.Slug,
		Status:           v.Status,
		AddressLine1:     v.AddressLine1,
		AddressLine2:     v.AddressLine2,
		City:             v.City,
		StateProvince:    v.StateProvince,
		Country:          v.Country,
		PostalCode:       v.PostalCode,
		FormattedAddress: v.FormattedAddress,
		Timezone:         v.Timezone,
		WebsiteURL:       v.WebsiteUrl,
		ContactEmail:     v.ContactEmail,
		ContactPhone:     v.ContactPhone,
		LogoURL:          v.LogoUrl,
		PhotoURL:         v.PhotoUrl,
		VenueMapURL:      v.VenueMapUrl,
		Description:      v.Description,
		Bio:              v.Bio,
		Notes:            v.Notes,
		CreatedByUserID:  v.CreatedByUserID,
		CourtCount:       courtCount,
		CreatedAt:        v.CreatedAt.Format(time.RFC3339),
		UpdatedAt:        v.UpdatedAt.Format(time.RFC3339),
	}

	if v.Latitude.Valid {
		resp.Latitude = &v.Latitude.Float64
	}
	if v.Longitude.Valid {
		resp.Longitude = &v.Longitude.Float64
	}
	if v.OrgID.Valid {
		resp.OrgID = &v.OrgID.Int64
	}
	if v.ManagedByUserID.Valid {
		resp.ManagedByUserID = &v.ManagedByUserID.Int64
	}

	// JSONB fields: use raw bytes or default to []
	if len(v.SurfaceTypes) > 0 {
		resp.SurfaceTypes = json.RawMessage(v.SurfaceTypes)
	} else {
		resp.SurfaceTypes = json.RawMessage("[]")
	}
	if len(v.Amenities) > 0 {
		resp.Amenities = json.RawMessage(v.Amenities)
	} else {
		resp.Amenities = json.RawMessage("[]")
	}

	return resp
}

func toCourtResponse(c generated.Court) CourtResponse {
	resp := CourtResponse{
		ID:           c.ID,
		Name:         c.Name,
		Slug:         c.Slug,
		SurfaceType:  c.SurfaceType,
		IsShowCourt:  c.IsShowCourt,
		IsActive:     c.IsActive,
		IsTemporary:  c.IsTemporary,
		SortOrder:    c.SortOrder,
		Notes:        c.Notes,
		StreamURL:    c.StreamUrl,
		StreamType:   c.StreamType,
		StreamIsLive: c.StreamIsLive,
		StreamTitle:  c.StreamTitle,
		CreatedAt:    c.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    c.UpdatedAt.Format(time.RFC3339),
	}

	if c.VenueID.Valid {
		resp.VenueID = &c.VenueID.Int64
	}
	if c.CreatedByUserID.Valid {
		resp.CreatedByUserID = &c.CreatedByUserID.Int64
	}

	return resp
}

// DetectStreamType returns the stream type based on the URL.
func DetectStreamType(url string) string {
	lower := strings.ToLower(url)
	switch {
	case strings.Contains(lower, "youtube.com") || strings.Contains(lower, "youtu.be"):
		return "youtube"
	case strings.Contains(lower, "twitch.tv"):
		return "twitch"
	case strings.Contains(lower, "vimeo.com"):
		return "vimeo"
	case strings.HasSuffix(lower, ".m3u8") || strings.Contains(lower, "/hls/"):
		return "hls"
	default:
		return "other"
	}
}

// CreateVenue creates a new venue in draft status.
func (s *VenueService) CreateVenue(ctx context.Context, params generated.CreateVenueParams) (VenueResponse, error) {
	if params.Name == "" {
		return VenueResponse{}, &ValidationError{Message: "name is required"}
	}

	// Force draft status on creation
	params.Status = "draft"

	// Generate slug with collision check
	baseSlug := generateSlug(params.Name)
	params.Slug = baseSlug

	slugFound := false
	for i := 0; i < 100; i++ {
		candidate := baseSlug
		if i > 0 {
			candidate = fmt.Sprintf("%s-%d", baseSlug, i)
		}
		count, err := s.queries.CheckVenueSlugExists(ctx, candidate)
		if err != nil {
			return VenueResponse{}, fmt.Errorf("failed to check slug: %w", err)
		}
		if count == 0 {
			params.Slug = candidate
			slugFound = true
			break
		}
	}
	if !slugFound {
		return VenueResponse{}, &ConflictError{Message: "unable to generate unique slug, try a different name"}
	}

	venue, err := s.queries.CreateVenue(ctx, params)
	if err != nil {
		return VenueResponse{}, fmt.Errorf("failed to create venue: %w", err)
	}

	// Auto-add creator as admin manager
	_, _ = s.queries.AddVenueManager(ctx, generated.AddVenueManagerParams{
		VenueID: venue.ID,
		UserID:  params.CreatedByUserID,
		Role:    "admin",
		AddedBy: pgtype.Int8{Int64: params.CreatedByUserID, Valid: true},
	})

	return toVenueResponse(venue, 0), nil
}

// GetVenue retrieves a venue by ID with court count.
func (s *VenueService) GetVenue(ctx context.Context, venueID int64) (VenueResponse, error) {
	venue, err := s.queries.GetVenueByID(ctx, venueID)
	if err != nil {
		return VenueResponse{}, &NotFoundError{Message: "venue not found"}
	}

	courtCount, err := s.queries.GetVenueCourtCount(ctx, pgtype.Int8{Int64: venueID, Valid: true})
	if err != nil {
		return VenueResponse{}, fmt.Errorf("failed to get court count: %w", err)
	}

	return toVenueResponse(venue, courtCount), nil
}

// UpdateVenue updates a venue's details.
func (s *VenueService) UpdateVenue(ctx context.Context, venueID int64, params generated.UpdateVenueParams) (VenueResponse, error) {
	params.VenueID = venueID

	venue, err := s.queries.UpdateVenue(ctx, params)
	if err != nil {
		return VenueResponse{}, &NotFoundError{Message: "venue not found"}
	}

	courtCount, err := s.queries.GetVenueCourtCount(ctx, pgtype.Int8{Int64: venueID, Valid: true})
	if err != nil {
		return VenueResponse{}, fmt.Errorf("failed to get court count: %w", err)
	}

	return toVenueResponse(venue, courtCount), nil
}

// DeleteVenue soft-deletes a venue.
func (s *VenueService) DeleteVenue(ctx context.Context, venueID int64) error {
	return s.queries.SoftDeleteVenue(ctx, venueID)
}

// ListVenues lists venues with pagination and optional status filter.
func (s *VenueService) ListVenues(ctx context.Context, limit, offset int32, status *string) ([]VenueResponse, int64, error) {
	venues, err := s.queries.ListVenues(ctx, generated.ListVenuesParams{
		Limit:  limit,
		Offset: offset,
		Status: status,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list venues: %w", err)
	}

	count, err := s.queries.CountVenues(ctx, status)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count venues: %w", err)
	}

	result := make([]VenueResponse, len(venues))
	for i, v := range venues {
		result[i] = toVenueResponse(v, 0)
	}

	return result, count, nil
}

// SearchVenues searches venues with filters.
func (s *VenueService) SearchVenues(ctx context.Context, params generated.SearchVenuesParams) ([]VenueResponse, error) {
	venues, err := s.queries.SearchVenues(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("failed to search venues: %w", err)
	}
	result := make([]VenueResponse, len(venues))
	for i, v := range venues {
		result[i] = toVenueResponse(v, 0)
	}
	return result, nil
}

// CountSearchVenues counts venues matching search filters.
func (s *VenueService) CountSearchVenues(ctx context.Context, params generated.CountSearchVenuesParams) (int64, error) {
	return s.queries.CountSearchVenues(ctx, params)
}

// SubmitVenueForReview transitions a venue from draft to pending_review.
// Only the creator can submit.
func (s *VenueService) SubmitVenueForReview(ctx context.Context, venueID int64, requesterID int64) (VenueResponse, error) {
	venue, err := s.queries.GetVenueByID(ctx, venueID)
	if err != nil {
		return VenueResponse{}, &NotFoundError{Message: "venue not found"}
	}

	if venue.CreatedByUserID != requesterID {
		return VenueResponse{}, &ValidationError{Message: "only the venue creator can submit for review"}
	}

	if venue.Status != "draft" {
		return VenueResponse{}, &ValidationError{Message: "only draft venues can be submitted for review"}
	}

	updated, err := s.queries.UpdateVenueStatus(ctx, generated.UpdateVenueStatusParams{
		ID:     venueID,
		Status: "pending_review",
	})
	if err != nil {
		return VenueResponse{}, fmt.Errorf("failed to update venue status: %w", err)
	}

	courtCount, err := s.queries.GetVenueCourtCount(ctx, pgtype.Int8{Int64: venueID, Valid: true})
	if err != nil {
		return VenueResponse{}, fmt.Errorf("failed to get court count: %w", err)
	}

	return toVenueResponse(updated, courtCount), nil
}

// ApproveVenue transitions a venue from pending_review to published.
func (s *VenueService) ApproveVenue(ctx context.Context, venueID int64) (VenueResponse, error) {
	venue, err := s.queries.GetVenueByID(ctx, venueID)
	if err != nil {
		return VenueResponse{}, &NotFoundError{Message: "venue not found"}
	}

	if venue.Status != "pending_review" {
		return VenueResponse{}, &ValidationError{Message: "only pending_review venues can be approved"}
	}

	updated, err := s.queries.UpdateVenueStatus(ctx, generated.UpdateVenueStatusParams{
		ID:     venueID,
		Status: "published",
	})
	if err != nil {
		return VenueResponse{}, fmt.Errorf("failed to approve venue: %w", err)
	}

	courtCount, err := s.queries.GetVenueCourtCount(ctx, pgtype.Int8{Int64: venueID, Valid: true})
	if err != nil {
		return VenueResponse{}, fmt.Errorf("failed to get court count: %w", err)
	}

	return toVenueResponse(updated, courtCount), nil
}

// RejectVenue transitions a venue from pending_review back to draft.
func (s *VenueService) RejectVenue(ctx context.Context, venueID int64) (VenueResponse, error) {
	venue, err := s.queries.GetVenueByID(ctx, venueID)
	if err != nil {
		return VenueResponse{}, &NotFoundError{Message: "venue not found"}
	}

	if venue.Status != "pending_review" {
		return VenueResponse{}, &ValidationError{Message: "only pending_review venues can be rejected"}
	}

	updated, err := s.queries.UpdateVenueStatus(ctx, generated.UpdateVenueStatusParams{
		ID:     venueID,
		Status: "draft",
	})
	if err != nil {
		return VenueResponse{}, fmt.Errorf("failed to reject venue: %w", err)
	}

	courtCount, err := s.queries.GetVenueCourtCount(ctx, pgtype.Int8{Int64: venueID, Valid: true})
	if err != nil {
		return VenueResponse{}, fmt.Errorf("failed to get court count: %w", err)
	}

	return toVenueResponse(updated, courtCount), nil
}

// CreateCourt creates a new court, optionally attached to a venue.
func (s *VenueService) CreateCourt(ctx context.Context, params generated.CreateCourtParams) (CourtResponse, error) {
	if params.Name == "" {
		return CourtResponse{}, &ValidationError{Message: "name is required"}
	}

	// Generate slug
	baseSlug := generateSlug(params.Name)
	params.Slug = baseSlug

	// Auto-detect stream type if stream_url is provided
	if params.StreamUrl != nil && *params.StreamUrl != "" {
		detected := DetectStreamType(*params.StreamUrl)
		params.StreamType = &detected
	}

	// Check slug collision (venue-scoped or global)
	slugFound := false
	for i := 0; i < 100; i++ {
		candidate := baseSlug
		if i > 0 {
			candidate = fmt.Sprintf("%s-%d", baseSlug, i)
		}

		var count int64
		var err error

		if params.VenueID.Valid {
			count, err = s.queries.CheckCourtSlugInVenue(ctx, generated.CheckCourtSlugInVenueParams{
				Slug:    candidate,
				VenueID: params.VenueID,
			})
		} else {
			count, err = s.queries.CheckFloatingCourtSlug(ctx, candidate)
		}
		if err != nil {
			return CourtResponse{}, fmt.Errorf("failed to check court slug: %w", err)
		}
		if count == 0 {
			params.Slug = candidate
			slugFound = true
			break
		}
	}
	if !slugFound {
		return CourtResponse{}, &ConflictError{Message: "unable to generate unique slug, try a different name"}
	}

	court, err := s.queries.CreateCourt(ctx, params)
	if err != nil {
		return CourtResponse{}, fmt.Errorf("failed to create court: %w", err)
	}

	return toCourtResponse(court), nil
}

// GetCourt retrieves a court by ID.
func (s *VenueService) GetCourt(ctx context.Context, courtID int64) (CourtResponse, error) {
	court, err := s.queries.GetCourtByID(ctx, courtID)
	if err != nil {
		return CourtResponse{}, &NotFoundError{Message: "court not found"}
	}

	resp := toCourtResponse(court)

	// Enrich with venue name
	if court.VenueID.Valid {
		venue, err := s.queries.GetVenueByID(ctx, court.VenueID.Int64)
		if err == nil {
			resp.VenueName = &venue.Name
		}
	}

	return resp, nil
}

// ListCourtsByVenue lists all courts for a venue.
func (s *VenueService) ListCourtsByVenue(ctx context.Context, venueID int64) ([]CourtResponse, error) {
	courts, err := s.queries.ListCourtsByVenue(ctx, pgtype.Int8{Int64: venueID, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("failed to list courts: %w", err)
	}

	result := make([]CourtResponse, len(courts))
	for i, c := range courts {
		result[i] = toCourtResponse(c)
	}

	return result, nil
}

// CourtListFilters narrows the platform-wide ListCourts query.
type CourtListFilters struct {
	VenueID  *int64
	IsActive *bool
}

// ListCourts lists all courts across the platform with optional filters
// and pagination. Returns the list and the total count for pagination.
func (s *VenueService) ListCourts(
	ctx context.Context,
	filters CourtListFilters,
	limit, offset int32,
) ([]CourtResponse, int64, error) {
	listParams := generated.ListCourtsParams{
		Limit:  limit,
		Offset: offset,
	}
	countParams := generated.CountCourtsFilteredParams{}

	if filters.VenueID != nil {
		v := pgtype.Int8{Int64: *filters.VenueID, Valid: true}
		listParams.VenueID = v
		countParams.VenueID = v
	}
	if filters.IsActive != nil {
		v := pgtype.Bool{Bool: *filters.IsActive, Valid: true}
		listParams.IsActive = v
		countParams.IsActive = v
	}

	courts, err := s.queries.ListCourts(ctx, listParams)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list courts: %w", err)
	}

	total, err := s.queries.CountCourtsFiltered(ctx, countParams)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count courts: %w", err)
	}

	// Build venue name cache to avoid N+1
	venueNameCache := make(map[int64]string)
	for _, c := range courts {
		if c.VenueID.Valid {
			if _, ok := venueNameCache[c.VenueID.Int64]; !ok {
				venue, err := s.queries.GetVenueByID(ctx, c.VenueID.Int64)
				if err == nil {
					venueNameCache[venue.ID] = venue.Name
				}
			}
		}
	}

	result := make([]CourtResponse, len(courts))
	for i, c := range courts {
		resp := toCourtResponse(c)
		resp.ActiveMatch = s.activeMatchForCourt(ctx, c.ID)
		resp.OnDeckMatch = s.onDeckMatchForCourt(ctx, c.ID)
		if c.VenueID.Valid {
			if name, ok := venueNameCache[c.VenueID.Int64]; ok {
				resp.VenueName = &name
			}
		}
		result[i] = resp
	}

	return result, total, nil
}

// UpdateCourt updates a court's details.
func (s *VenueService) UpdateCourt(ctx context.Context, courtID int64, params generated.UpdateCourtParams) (CourtResponse, error) {
	params.CourtID = courtID

	// Auto-detect stream type if stream_url is being updated
	if params.StreamUrl != nil && *params.StreamUrl != "" {
		detected := DetectStreamType(*params.StreamUrl)
		params.StreamType = &detected
	}

	court, err := s.queries.UpdateCourt(ctx, params)
	if err != nil {
		return CourtResponse{}, &NotFoundError{Message: "court not found"}
	}
	return toCourtResponse(court), nil
}

// DeleteCourt soft-deletes a court.
func (s *VenueService) DeleteCourt(ctx context.Context, courtID int64) error {
	return s.queries.SoftDeleteCourt(ctx, courtID)
}

// TournamentCourtResponse is the API response for a tournament court link.
type TournamentCourtResponse struct {
	ID           int64  `json:"id"`
	TournamentID int64  `json:"tournament_id"`
	CourtID      int64  `json:"court_id"`
	IsTemporary  bool   `json:"is_temporary"`
	CreatedAt    string `json:"created_at"`
}

// AssignCourtToTournament links an existing court to a tournament.
func (s *VenueService) AssignCourtToTournament(ctx context.Context, tournamentID, courtID int64, isTemp bool) (TournamentCourtResponse, error) {
	tc, err := s.queries.AssignCourtToTournament(ctx, generated.AssignCourtToTournamentParams{
		TournamentID: tournamentID,
		CourtID:      courtID,
		IsTemporary:  isTemp,
	})
	if err != nil {
		return TournamentCourtResponse{}, fmt.Errorf("assigning court to tournament: %w", err)
	}
	return TournamentCourtResponse{
		ID:           tc.ID,
		TournamentID: tc.TournamentID,
		CourtID:      tc.CourtID,
		IsTemporary:  tc.IsTemporary,
		CreatedAt:    tc.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}, nil
}

// UnassignCourtFromTournament removes a court from a tournament.
func (s *VenueService) UnassignCourtFromTournament(ctx context.Context, tournamentID, courtID int64) error {
	return s.queries.UnassignCourtFromTournament(ctx, generated.UnassignCourtFromTournamentParams{
		TournamentID: tournamentID,
		CourtID:      courtID,
	})
}

// CreateTempCourtForTournament creates a floating temporary court
// and assigns it to the tournament.
func (s *VenueService) CreateTempCourtForTournament(ctx context.Context, tournamentID int64, name string, surfaceType *string, createdBy int64) (CourtResponse, error) {
	params := generated.CreateCourtParams{
		Name:            name,
		IsTemporary:     true,
		IsActive:        true,
		CreatedByUserID: pgtype.Int8{Int64: createdBy, Valid: true},
	}
	if surfaceType != nil {
		params.SurfaceType = surfaceType
	}

	court, err := s.CreateCourt(ctx, params)
	if err != nil {
		return CourtResponse{}, err
	}

	// Link the court to the tournament
	_, err = s.queries.AssignCourtToTournament(ctx, generated.AssignCourtToTournamentParams{
		TournamentID: tournamentID,
		CourtID:      court.ID,
		IsTemporary:  true,
	})
	if err != nil {
		return CourtResponse{}, fmt.Errorf("linking temp court to tournament: %w", err)
	}

	return court, nil
}

// ListCourtsByTournament returns every court that has at least one match
// scheduled in the given tournament, each enriched with its currently-
// active match (warmup, in_progress, or paused) and its next on-deck
// match (first queued non-active, non-terminal match on that court).
//
// If the service has no MatchService wired, matches come back in the flat
// toMatchResponse shape (nested team summaries and timeouts counts are
// omitted). Both active_match and on_deck_match may be nil.
func (s *VenueService) ListCourtsByTournament(ctx context.Context, tournamentID int64) ([]CourtResponse, error) {
	courts, err := s.queries.ListCourtsByTournament(ctx, pgtype.Int8{Int64: tournamentID, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("listing courts by tournament: %w", err)
	}

	result := make([]CourtResponse, len(courts))
	for i, c := range courts {
		resp := toCourtResponse(c)
		resp.ActiveMatch = s.activeMatchForCourt(ctx, c.ID)
		resp.OnDeckMatch = s.onDeckMatchForCourt(ctx, c.ID)
		result[i] = resp
	}
	return result, nil
}

// activeMatchForCourt fetches the current active match on a court (warmup,
// in_progress, or paused) and returns it as an enriched MatchResponse when
// a MatchService is wired, otherwise as the flat shape. Returns nil if no
// active match exists or on any lookup error.
func (s *VenueService) activeMatchForCourt(ctx context.Context, courtID int64) *MatchResponse {
	m, err := s.queries.GetActiveMatchOnCourt(ctx, pgtype.Int8{Int64: courtID, Valid: true})
	if err != nil {
		return nil
	}
	resp := s.matchToResponse(ctx, m)
	return &resp
}

// onDeckMatchForCourt returns the next match queued on the court that is
// neither active nor in a terminal state. Matches are drawn from
// ListMatchesByCourt, which orders by scheduled_at NULLS LAST, created_at.
func (s *VenueService) onDeckMatchForCourt(ctx context.Context, courtID int64) *MatchResponse {
	matches, err := s.queries.ListMatchesByCourt(ctx, generated.ListMatchesByCourtParams{
		CourtID: pgtype.Int8{Int64: courtID, Valid: true},
		Limit:   20,
		Offset:  0,
	})
	if err != nil {
		return nil
	}
	for _, m := range matches {
		switch m.Status {
		case "warmup", "in_progress", "paused":
			continue // already represented as active_match
		case "completed", "cancelled", "forfeited":
			continue // terminal
		}
		resp := s.matchToResponse(ctx, m)
		return &resp
	}
	return nil
}

// matchToResponse picks the enriched shape when a MatchService is wired,
// otherwise falls back to the flat toMatchResponse.
func (s *VenueService) matchToResponse(ctx context.Context, m generated.Match) MatchResponse {
	if s.matchService != nil {
		return s.matchService.enrichedMatchResponse(ctx, m)
	}
	return toMatchResponse(m)
}

// --- Venue Managers ---

// VenueManagerResponse is the public representation of a venue manager.
type VenueManagerResponse struct {
	ID          int64   `json:"id"`
	VenueID     int64   `json:"venue_id"`
	UserID      int64   `json:"user_id"`
	Role        string  `json:"role"`
	AddedAt     string  `json:"added_at"`
	FirstName   string  `json:"first_name"`
	LastName    string  `json:"last_name"`
	Email       *string `json:"email,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	PublicID    string  `json:"public_id"`
}

// CanManageVenue checks if a user can manage (edit) a venue.
// Returns true if the user is a venue manager/admin, the venue creator, or a platform admin.
func (s *VenueService) CanManageVenue(ctx context.Context, venueID int64, userID int64, userRole string) (bool, error) {
	if userRole == "platform_admin" {
		return true, nil
	}

	// Check venue creator
	venue, err := s.queries.GetVenueByID(ctx, venueID)
	if err != nil {
		return false, err
	}
	if venue.CreatedByUserID == userID {
		return true, nil
	}

	// Check venue_managers table
	isMgr, err := s.queries.IsVenueManager(ctx, generated.IsVenueManagerParams{
		VenueID: venueID,
		UserID:  userID,
	})
	if err != nil {
		return false, err
	}
	return isMgr, nil
}

// CanManageCourt reports whether the given user may manage (edit/delete) a
// court. Returns true for platform admins, the court's creator, or a manager
// of the court's owning venue — the same ownership boundary
// OverlayService.CanManageCourt enforces for overlay-config writes, so a
// caller cannot mutate a court outside their org/tournament. Returns
// NotFoundError when the court does not exist.
func (s *VenueService) CanManageCourt(ctx context.Context, courtID int64, userID int64, userRole string) (bool, error) {
	if userRole == "platform_admin" {
		return true, nil
	}

	court, err := s.queries.GetCourtByID(ctx, courtID)
	if err != nil {
		return false, &NotFoundError{Message: "court not found"}
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
			return false, err
		}
		if isMgr {
			return true, nil
		}
	}

	return false, nil
}

// CanAdminVenue checks if a user has admin-level access to a venue
// (can add/remove managers). Returns true for venue admins, creator, or platform admin.
func (s *VenueService) CanAdminVenue(ctx context.Context, venueID int64, userID int64, userRole string) (bool, error) {
	if userRole == "platform_admin" {
		return true, nil
	}

	venue, err := s.queries.GetVenueByID(ctx, venueID)
	if err != nil {
		return false, err
	}
	if venue.CreatedByUserID == userID {
		return true, nil
	}

	isAdmin, err := s.queries.IsVenueAdmin(ctx, generated.IsVenueAdminParams{
		VenueID: venueID,
		UserID:  userID,
	})
	if err != nil {
		return false, err
	}
	return isAdmin, nil
}

// ListVenueManagers returns all managers for a venue.
func (s *VenueService) ListVenueManagers(ctx context.Context, venueID int64) ([]VenueManagerResponse, error) {
	rows, err := s.queries.ListVenueManagers(ctx, venueID)
	if err != nil {
		return nil, fmt.Errorf("listing venue managers: %w", err)
	}

	results := make([]VenueManagerResponse, 0, len(rows))
	for _, r := range rows {
		results = append(results, VenueManagerResponse{
			ID:          r.ID,
			VenueID:     r.VenueID,
			UserID:      r.UserID,
			Role:        r.Role,
			AddedAt:     r.AddedAt.Format(time.RFC3339),
			FirstName:   r.FirstName,
			LastName:    r.LastName,
			Email:       r.Email,
			DisplayName: r.DisplayName,
			PublicID:    r.PublicID,
		})
	}
	return results, nil
}

// AddVenueManager adds a user as a manager for a venue.
func (s *VenueService) AddVenueManager(ctx context.Context, venueID int64, userID int64, role string, addedBy int64) (VenueManagerResponse, error) {
	if role != "manager" && role != "admin" {
		return VenueManagerResponse{}, &ValidationError{Message: "role must be 'manager' or 'admin'"}
	}

	vm, err := s.queries.AddVenueManager(ctx, generated.AddVenueManagerParams{
		VenueID: venueID,
		UserID:  userID,
		Role:    role,
		AddedBy: pgtype.Int8{Int64: addedBy, Valid: true},
	})
	if err != nil {
		return VenueManagerResponse{}, fmt.Errorf("adding venue manager: %w", err)
	}

	// Fetch user details for response
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		return VenueManagerResponse{}, fmt.Errorf("fetching user: %w", err)
	}

	return VenueManagerResponse{
		ID:          vm.ID,
		VenueID:     vm.VenueID,
		UserID:      vm.UserID,
		Role:        vm.Role,
		AddedAt:     vm.AddedAt.Format(time.RFC3339),
		FirstName:   user.FirstName,
		LastName:    user.LastName,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		PublicID:    user.PublicID,
	}, nil
}

// RemoveVenueManager removes a user from a venue's managers.
func (s *VenueService) RemoveVenueManager(ctx context.Context, venueID int64, userID int64) error {
	return s.queries.RemoveVenueManager(ctx, generated.RemoveVenueManagerParams{
		VenueID: venueID,
		UserID:  userID,
	})
}

// UpdateVenueManagerRole changes a manager's role.
func (s *VenueService) UpdateVenueManagerRole(ctx context.Context, venueID int64, userID int64, role string) error {
	if role != "manager" && role != "admin" {
		return &ValidationError{Message: "role must be 'manager' or 'admin'"}
	}

	_, err := s.queries.UpdateVenueManagerRole(ctx, generated.UpdateVenueManagerRoleParams{
		VenueID: venueID,
		UserID:  userID,
		Role:    role,
	})
	return err
}

// ListVenuesByManager returns all venues the given user manages.
func (s *VenueService) ListVenuesByManager(ctx context.Context, userID int64) ([]VenueResponse, error) {
	venues, err := s.queries.ListVenuesByManager(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("listing managed venues: %w", err)
	}

	results := make([]VenueResponse, 0, len(venues))
	for _, v := range venues {
		results = append(results, toVenueResponse(v, 0))
	}
	return results, nil
}
