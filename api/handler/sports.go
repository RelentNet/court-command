// api/handler/sports.go
package handler

import (
	"net/http"

	"github.com/court-command/court-command/service"
)

// SportsHandler exposes the public sport directory endpoint. The sport
// picker (unauthenticated landing page) calls this before the user has
// selected an organization, so it must be mounted in the public block of
// the router (no RequireAuth/RequireJWT middleware).
type SportsHandler struct {
	sportsService *service.SportsService
}

// NewSportsHandler creates a new SportsHandler.
func NewSportsHandler(s *service.SportsService) *SportsHandler {
	return &SportsHandler{sportsService: s}
}

// ListSports returns the active sports ordered by sort_order. Public
// endpoint — no auth required. Response shape: a JSON array of SportDTO.
func (h *SportsHandler) ListSports(w http.ResponseWriter, r *http.Request) {
	sports, err := h.sportsService.List(r.Context())
	if err != nil {
		HandleServiceError(w, err)
		return
	}
	Success(w, sports)
}
