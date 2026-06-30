package ws

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"

	"github.com/court-command/court-command/pubsub"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
)

// Handler manages WebSocket connections for real-time updates.
type Handler struct {
	ps       *pubsub.PubSub
	logger   *slog.Logger
	upgrader websocket.Upgrader
}

// NewHandler creates a new WebSocket handler. allowedOrigins is the set of
// browser Origins permitted to open a WebSocket (the same list parsed from
// CORS_ALLOWED_ORIGINS, see api/config/config.go). The configured web
// origin MUST be present so OBS / browser-source overlay clients, which
// load the overlay page from that origin, can connect. Requests with an
// empty Origin header (non-browser clients such as native apps and the Go
// test client) are always allowed, since the Origin check only defends
// against cross-site WebSocket hijacking from a browser.
func NewHandler(ps *pubsub.PubSub, logger *slog.Logger, allowedOrigins []string) *Handler {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		if o != "" {
			allowed[o] = true
		}
	}

	return &Handler{
		ps:     ps,
		logger: logger,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				// Non-browser clients (native apps, server-to-server, the
				// Go websocket test client) send no Origin; nothing to
				// hijack, so allow them.
				if origin == "" {
					return true
				}
				if allowed[origin] {
					return true
				}
				logger.Warn("websocket origin rejected", "origin", origin, "remote", r.RemoteAddr)
				return false
			},
		},
	}
}

// Routes returns a chi.Router with all WebSocket endpoints mounted.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/match/{publicID}", h.HandleMatch)
	r.Get("/court/{courtID}", h.HandleCourt)
	r.Get("/division/{divisionID}", h.HandleDivision)
	r.Get("/tournament/{tournamentID}", h.HandleTournament)
	r.Get("/league/{leagueID}", h.HandleLeague)
	r.Get("/overlay/{courtID}", h.HandleOverlay)

	return r
}

// HandleMatch subscribes the client to a single match channel.
func (h *Handler) HandleMatch(w http.ResponseWriter, r *http.Request) {
	publicID := chi.URLParam(r, "publicID")
	if publicID == "" {
		http.Error(w, "missing match public ID", http.StatusBadRequest)
		return
	}
	h.handleSubscription(w, r, pubsub.MatchChannel(publicID))
}

// HandleCourt subscribes the client to a court channel (all matches on that court).
func (h *Handler) HandleCourt(w http.ResponseWriter, r *http.Request) {
	courtID, err := strconv.ParseInt(chi.URLParam(r, "courtID"), 10, 64)
	if err != nil {
		http.Error(w, "invalid court ID", http.StatusBadRequest)
		return
	}
	h.handleSubscription(w, r, pubsub.CourtChannel(courtID))
}

// HandleDivision subscribes the client to a division channel.
func (h *Handler) HandleDivision(w http.ResponseWriter, r *http.Request) {
	divisionID, err := strconv.ParseInt(chi.URLParam(r, "divisionID"), 10, 64)
	if err != nil {
		http.Error(w, "invalid division ID", http.StatusBadRequest)
		return
	}
	h.handleSubscription(w, r, pubsub.DivisionChannel(divisionID))
}

// HandleTournament subscribes the client to a tournament channel.
func (h *Handler) HandleTournament(w http.ResponseWriter, r *http.Request) {
	tournamentID, err := strconv.ParseInt(chi.URLParam(r, "tournamentID"), 10, 64)
	if err != nil {
		http.Error(w, "invalid tournament ID", http.StatusBadRequest)
		return
	}
	h.handleSubscription(w, r, pubsub.TournamentChannel(tournamentID))
}

// HandleLeague subscribes the client to a league channel.
func (h *Handler) HandleLeague(w http.ResponseWriter, r *http.Request) {
	leagueID, err := strconv.ParseInt(chi.URLParam(r, "leagueID"), 10, 64)
	if err != nil {
		http.Error(w, "invalid league ID", http.StatusBadRequest)
		return
	}
	h.handleSubscription(w, r, pubsub.LeagueChannel(leagueID))
}

// HandleOverlay subscribes the client to the overlay channel for a court.
func (h *Handler) HandleOverlay(w http.ResponseWriter, r *http.Request) {
	courtID, err := strconv.ParseInt(chi.URLParam(r, "courtID"), 10, 64)
	if err != nil {
		http.Error(w, "invalid court ID", http.StatusBadRequest)
		return
	}
	h.handleSubscription(w, r, pubsub.OverlayChannel(courtID))
}

// handleSubscription upgrades the HTTP connection to WebSocket,
// subscribes to the given Redis channel, and relays messages to the client.
func (h *Handler) handleSubscription(w http.ResponseWriter, r *http.Request, channel string) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Error("websocket upgrade failed", "channel", channel, "error", err)
		return
	}
	defer conn.Close()

	h.logger.Info("websocket connected", "channel", channel, "remote", r.RemoteAddr)

	// Subscribe to the Redis channel.
	//
	// Use context.WithoutCancel to strip the HTTP request's deadline/cancellation
	// (the global chimw.Timeout(60s) middleware applies to /ws too) while
	// preserving request-scoped values. Without this, every long-lived WebSocket
	// would be forcibly torn down after 60s when the request context's deadline
	// fires. The subscription is still cancelled on real client disconnect via
	// the deferred cancelSub() below plus the read-pump's done channel.
	msgChan, cancelSub, err := h.ps.Subscribe(context.WithoutCancel(r.Context()), channel)
	if err != nil {
		h.logger.Error("failed to subscribe", "channel", channel, "error", err)
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "subscribe failed"))
		return
	}
	defer cancelSub()

	// Read pump: consume pongs and detect client disconnect.
	done := make(chan struct{})
	go func() {
		defer close(done)
		conn.SetReadDeadline(time.Now().Add(pongWait))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(pongWait))
			return nil
		})
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	// Write pump: relay Redis messages and send pings.
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			h.logger.Info("websocket disconnected", "channel", channel, "remote", r.RemoteAddr)
			return
		case msg, ok := <-msgChan:
			if !ok {
				conn.SetWriteDeadline(time.Now().Add(writeWait))
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteJSON(msg); err != nil {
				h.logger.Warn("websocket write failed", "channel", channel, "error", err)
				return
			}
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
