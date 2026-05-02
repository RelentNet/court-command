// api/service/profile.go
//
// ProfileService is the Phase 3 (Logto integration) service for the new
// player_profiles 1:1 table. It is separate from the legacy PlayerService
// which still reads/writes scalar columns on the users table for the
// cookie-session API. Phase 6 cutover will collapse the two; until then
// the new /api/v1/me/profile endpoint owned by ProfileHandler is the
// only caller of this service.
package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/court-command/court-command/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// ProfileService wraps the generated player_profiles queries and translates
// between the storage shape (pgtype.Date, pgtype.Float8, *string columns)
// and the wire DTO that ProfileHandler returns to the JWT-authenticated
// frontend.
type ProfileService struct {
	queries *generated.Queries
}

// NewProfileService builds a ProfileService bound to the given query set.
func NewProfileService(q *generated.Queries) *ProfileService {
	return &ProfileService{queries: q}
}

// PlayerProfileDTO is the wire shape used by GET/PATCH /api/v1/me/profile.
//
// Field naming follows the actual player_profiles columns. The legacy
// users-table profile uses overlapping names (city, country, etc) but
// is exposed via PlayerService and is not part of this DTO. Notable
// quirks the JSON contract pins down:
//
//   - JSON avatar_url maps to a Go field named AvatarURL (idiomatic Go).
//     The generated.PlayerProfile struct calls it AvatarUrl; profileToDTO
//     bridges the two.
//   - DateOfBirth is a *string in YYYY-MM-DD form so the form can round-trip
//     dates without a Date type the frontend has to decode.
//   - Latitude / Longitude are *float64 because pgtype.Float8 is awkward to
//     consume in JSON; nil means "no geocoding done yet".
//   - There is no street_address column and no emergency_contact_relation
//     column on player_profiles. address_line_1 + address_line_2 replace
//     "street" in the original Phase 3 plan.
type PlayerProfileDTO struct {
	UserID                int64    `json:"user_id"`
	Phone                 *string  `json:"phone,omitempty"`
	DuprID                *string  `json:"dupr_id,omitempty"`
	VairID                *string  `json:"vair_id,omitempty"`
	PaddleBrand           *string  `json:"paddle_brand,omitempty"`
	PaddleModel           *string  `json:"paddle_model,omitempty"`
	Gender                *string  `json:"gender,omitempty"`
	Handedness            *string  `json:"handedness,omitempty"`
	DateOfBirth           *string  `json:"date_of_birth,omitempty"` // YYYY-MM-DD
	Bio                   *string  `json:"bio,omitempty"`
	AddressLine1          *string  `json:"address_line_1,omitempty"`
	AddressLine2          *string  `json:"address_line_2,omitempty"`
	City                  *string  `json:"city,omitempty"`
	StateProvince         *string  `json:"state_province,omitempty"`
	Country               *string  `json:"country,omitempty"`
	PostalCode            *string  `json:"postal_code,omitempty"`
	FormattedAddress      *string  `json:"formatted_address,omitempty"`
	Latitude              *float64 `json:"latitude,omitempty"`
	Longitude             *float64 `json:"longitude,omitempty"`
	EmergencyContactName  *string  `json:"emergency_contact_name,omitempty"`
	EmergencyContactPhone *string  `json:"emergency_contact_phone,omitempty"`
	MedicalNotes          *string  `json:"medical_notes,omitempty"`
	AvatarURL             *string  `json:"avatar_url,omitempty"` // JSON: avatar_url; Go: AvatarURL
	IsProfileHidden       bool     `json:"is_profile_hidden"`
}

// Get loads the player_profiles row for the user. When no row exists yet
// it returns an empty DTO carrying just the UserID so the frontend can
// render the form in "create" mode without a separate 404 handler.
// Any non-ErrNoRows database failure is surfaced wrapped.
func (s *ProfileService) Get(ctx context.Context, userID int64) (PlayerProfileDTO, error) {
	p, err := s.queries.GetPlayerProfileRow(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PlayerProfileDTO{UserID: userID}, nil
		}
		return PlayerProfileDTO{}, fmt.Errorf("get profile: %w", err)
	}
	return profileToDTO(p), nil
}

// Upsert applies the partial update. Every DTO field is optional; nil
// pointers leave the existing column unchanged via the COALESCE pattern
// in UpsertPlayerProfile. After the write Upsert re-reads through Get so
// the response reflects the merged final state (including pre-existing
// columns the caller didn't send).
//
// IsProfileHidden is intentionally a plain bool on the DTO, not *bool:
// the form has a single checkbox and always sends a definite value. If
// future callers ever need "leave is_profile_hidden alone" semantics
// switch the DTO field to *bool and translate to pgtype.Bool here.
func (s *ProfileService) Upsert(ctx context.Context, userID int64, in PlayerProfileDTO) (PlayerProfileDTO, error) {
	params, err := dtoToUpsertParams(userID, in)
	if err != nil {
		return PlayerProfileDTO{}, fmt.Errorf("convert: %w", err)
	}
	if _, err := s.queries.UpsertPlayerProfile(ctx, params); err != nil {
		return PlayerProfileDTO{}, fmt.Errorf("upsert profile: %w", err)
	}
	return s.Get(ctx, userID)
}

// LookupUserByLogtoSubject resolves a JWT sub claim (Logto user ID) to
// the local users.id. Used by ProfileHandler before any profile op so
// Phase 3 routes can be called by anyone holding a valid token without
// the caller needing to know the local DB id.
//
// When Task 9's MirrorUser middleware lands it will pre-populate the
// local users.id on the request context, eliminating this lookup hop in
// protected routes. Until then a missing mirror surfaces here as a
// pgx.ErrNoRows-wrapped error and HandleServiceError maps that to 500.
// Once the webhook + middleware are in place we'll add a typed
// NotFoundError so the handler can distinguish "no mirror yet" from
// generic db failure.
func (s *ProfileService) LookupUserByLogtoSubject(ctx context.Context, logtoUserID string) (int64, error) {
	sub := logtoUserID
	user, err := s.queries.GetUserByLogtoUserID(ctx, &sub)
	if err != nil {
		return 0, fmt.Errorf("lookup user by logto subject: %w", err)
	}
	return user.ID, nil
}

// profileToDTO maps the generated row to the wire DTO. Pointer columns
// pass through; pgtype.Date and pgtype.Float8 are unwrapped only when
// Valid so JSON omitempty actually skips them when the DB has no value.
func profileToDTO(p generated.PlayerProfile) PlayerProfileDTO {
	dto := PlayerProfileDTO{
		UserID:                p.UserID,
		Phone:                 p.Phone,
		DuprID:                p.DuprID,
		VairID:                p.VairID,
		PaddleBrand:           p.PaddleBrand,
		PaddleModel:           p.PaddleModel,
		Gender:                p.Gender,
		Handedness:            p.Handedness,
		Bio:                   p.Bio,
		AddressLine1:          p.AddressLine1,
		AddressLine2:          p.AddressLine2,
		City:                  p.City,
		StateProvince:         p.StateProvince,
		Country:               p.Country,
		PostalCode:            p.PostalCode,
		FormattedAddress:      p.FormattedAddress,
		EmergencyContactName:  p.EmergencyContactName,
		EmergencyContactPhone: p.EmergencyContactPhone,
		MedicalNotes:          p.MedicalNotes,
		AvatarURL:             p.AvatarUrl,
		IsProfileHidden:       p.IsProfileHidden,
	}
	if p.DateOfBirth.Valid {
		s := p.DateOfBirth.Time.Format("2006-01-02")
		dto.DateOfBirth = &s
	}
	if p.Latitude.Valid {
		v := p.Latitude.Float64
		dto.Latitude = &v
	}
	if p.Longitude.Valid {
		v := p.Longitude.Float64
		dto.Longitude = &v
	}
	return dto
}

// dtoToUpsertParams converts the wire DTO back to the generated narg-shaped
// params struct. Pointers pass through unchanged; date / lat / lng are
// boxed into pgtype values only when the caller provided them (a nil DTO
// pointer becomes a zero pgtype with Valid=false, which the COALESCE in
// UpsertPlayerProfile reads as "leave column alone").
//
// is_profile_hidden is always sent as Valid=true because the DTO carries
// a definite bool. That means PATCH requests *do* always overwrite the
// stored is_profile_hidden, which matches the form's behaviour of
// always sending a checkbox value.
func dtoToUpsertParams(userID int64, in PlayerProfileDTO) (generated.UpsertPlayerProfileParams, error) {
	p := generated.UpsertPlayerProfileParams{
		UserID:                userID,
		Phone:                 in.Phone,
		DuprID:                in.DuprID,
		VairID:                in.VairID,
		PaddleBrand:           in.PaddleBrand,
		PaddleModel:           in.PaddleModel,
		Gender:                in.Gender,
		Handedness:            in.Handedness,
		Bio:                   in.Bio,
		AddressLine1:          in.AddressLine1,
		AddressLine2:          in.AddressLine2,
		City:                  in.City,
		StateProvince:         in.StateProvince,
		Country:               in.Country,
		PostalCode:            in.PostalCode,
		FormattedAddress:      in.FormattedAddress,
		EmergencyContactName:  in.EmergencyContactName,
		EmergencyContactPhone: in.EmergencyContactPhone,
		MedicalNotes:          in.MedicalNotes,
		AvatarUrl:             in.AvatarURL,
		IsProfileHidden:       pgtype.Bool{Bool: in.IsProfileHidden, Valid: true},
	}
	if in.DateOfBirth != nil {
		t, err := time.Parse("2006-01-02", *in.DateOfBirth)
		if err != nil {
			return p, fmt.Errorf("date_of_birth %q: %w", *in.DateOfBirth, err)
		}
		p.DateOfBirth = pgtype.Date{Time: t, Valid: true}
	}
	if in.Latitude != nil {
		p.Latitude = pgtype.Float8{Float64: *in.Latitude, Valid: true}
	}
	if in.Longitude != nil {
		p.Longitude = pgtype.Float8{Float64: *in.Longitude, Valid: true}
	}
	return p, nil
}
