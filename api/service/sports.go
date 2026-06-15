// api/service/sports.go
package service

import (
	"context"
	"fmt"

	"github.com/court-command/court-command/db/generated"
)

// SportsService handles sport lookup business logic. Sports are a small,
// rarely-changing lookup table (one row per supported sport). The service
// just wraps the generated queries and translates rows to DTOs so the
// generated.Sport type doesn't leak into HTTP responses.
type SportsService struct {
	queries *generated.Queries
}

// NewSportsService creates a new SportsService.
func NewSportsService(q *generated.Queries) *SportsService {
	return &SportsService{queries: q}
}

// SportDTO is the public JSON representation of a sport row. logto_org_id
// is included because the frontend needs it to request an org-scoped
// access token before the user picks a sport.
type SportDTO struct {
	ID         int64  `json:"id"`
	Slug       string `json:"slug"`
	Name       string `json:"name"`
	LogtoOrgID string `json:"logto_org_id"`
}

// List returns all active sports ordered by sort_order, name.
func (s *SportsService) List(ctx context.Context) ([]SportDTO, error) {
	rows, err := s.queries.ListSports(ctx)
	if err != nil {
		return nil, fmt.Errorf("list sports: %w", err)
	}
	out := make([]SportDTO, len(rows))
	for i, r := range rows {
		out[i] = SportDTO{
			ID:         r.ID,
			Slug:       r.Slug,
			Name:       r.Name,
			LogtoOrgID: r.LogtoOrgID,
		}
	}
	return out, nil
}
