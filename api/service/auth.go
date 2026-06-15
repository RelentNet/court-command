// api/service/auth.go
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/session"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// AuthService handles user registration and authentication.
type AuthService struct {
	db           *pgxpool.Pool
	queries      *generated.Queries
	sessionStore *session.Store
}

// NewAuthService creates a new AuthService.
func NewAuthService(db *pgxpool.Pool, sessionStore *session.Store) *AuthService {
	return &AuthService{
		db:           db,
		queries:      generated.New(db),
		sessionStore: sessionStore,
	}
}

// RegisterInput contains the fields required to register a new user.
type RegisterInput struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	DateOfBirth string `json:"date_of_birth"` // YYYY-MM-DD format
}

// Validate checks that all required fields are present and valid.
func (in *RegisterInput) Validate() error {
	in.Email = strings.TrimSpace(strings.ToLower(in.Email))
	in.FirstName = strings.TrimSpace(in.FirstName)
	in.LastName = strings.TrimSpace(in.LastName)

	if in.Email == "" {
		return errors.New("email is required")
	}
	if !strings.Contains(in.Email, "@") {
		return errors.New("email is invalid")
	}
	if in.Password == "" {
		return errors.New("password is required")
	}
	if len(in.Password) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	if len(in.Password) > 72 {
		return errors.New("password must be at most 72 characters")
	}
	if in.FirstName == "" {
		return errors.New("first_name is required")
	}
	if in.LastName == "" {
		return errors.New("last_name is required")
	}
	if in.DateOfBirth == "" {
		return errors.New("date_of_birth is required")
	}
	if _, err := time.Parse("2006-01-02", in.DateOfBirth); err != nil {
		return errors.New("date_of_birth must be in YYYY-MM-DD format")
	}
	return nil
}

// UserResponse is the public representation of a user (no password hash, no internal ID).
type UserResponse struct {
	PublicID    string    `json:"public_id"`
	Email       *string   `json:"email,omitempty"`
	FirstName   string    `json:"first_name"`
	LastName    string    `json:"last_name"`
	DisplayName *string   `json:"display_name,omitempty"`
	DateOfBirth string    `json:"date_of_birth"`
	Status      string    `json:"status"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Register creates a new user account and returns a session token.
func (s *AuthService) Register(ctx context.Context, input *RegisterInput) (*UserResponse, string, error) {
	if err := input.Validate(); err != nil {
		return nil, "", NewValidation(err.Error())
	}

	// Check for existing email
	_, err := s.queries.GetUserByEmail(ctx, &input.Email)
	if err == nil {
		return nil, "", NewConflict("email already registered")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, "", fmt.Errorf("checking email: %w", err)
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", fmt.Errorf("hashing password: %w", err)
	}

	dob, _ := time.Parse("2006-01-02", input.DateOfBirth) // already validated

	user, err := s.queries.CreateUser(ctx, generated.CreateUserParams{
		Email:        &input.Email,
		PasswordHash: string(hash),
		FirstName:    input.FirstName,
		LastName:     input.LastName,
		DateOfBirth:  dob,
		DisplayName:  nil,
		Role:         "player",
	})
	if err != nil {
		return nil, "", fmt.Errorf("creating user: %w", err)
	}

	// Create session
	token, err := s.sessionStore.Create(ctx, &session.Data{
		UserID:   user.ID,
		Email:    input.Email,
		Role:     user.Role,
		PublicID: user.PublicID,
	})
	if err != nil {
		return nil, "", fmt.Errorf("creating session: %w", err)
	}

	return userToResponse(&user), token, nil
}

// LoginInput contains the fields required to log in.
type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Login authenticates a user by email and password, returns a session token.
func (s *AuthService) Login(ctx context.Context, input *LoginInput) (*UserResponse, string, error) {
	input.Email = strings.TrimSpace(strings.ToLower(input.Email))

	if input.Email == "" || input.Password == "" {
		return nil, "", NewValidation("email and password are required")
	}

	user, err := s.queries.GetUserByEmail(ctx, &input.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", NewValidation("invalid email or password")
	}
	if err != nil {
		return nil, "", fmt.Errorf("looking up user: %w", err)
	}

	if user.Status != "active" {
		return nil, "", NewValidationf("account is %s", user.Status)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, "", NewValidation("invalid email or password")
	}

	token, err := s.sessionStore.Create(ctx, &session.Data{
		UserID:   user.ID,
		Email:    input.Email,
		Role:     user.Role,
		PublicID: user.PublicID,
	})
	if err != nil {
		return nil, "", fmt.Errorf("creating session: %w", err)
	}

	return userToResponse(&user), token, nil
}

// Logout invalidates the given session token.
func (s *AuthService) Logout(ctx context.Context, token string) error {
	return s.sessionStore.Delete(ctx, token)
}

// GetCurrentUser retrieves the user for the given session data.
func (s *AuthService) GetCurrentUser(ctx context.Context, sessionData *session.Data) (*UserResponse, error) {
	user, err := s.queries.GetUserByID(ctx, sessionData.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, NewNotFound("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("looking up user: %w", err)
	}

	return userToResponse(&user), nil
}

// GetCurrentUserByLogtoSubject retrieves the user mirror row by Logto
// user ID. Used by the JWT-protected /api/v1/auth/me endpoint introduced
// in Phase 3 (replaces the cookie-session GetCurrentUser path).
//
// Phase 3 Task 9's MirrorUser middleware should run BEFORE this is
// called, guaranteeing the row exists. If the middleware is skipped
// (testutil paths), pgx.ErrNoRows is propagated as NotFound so the
// handler can return 404.
func (s *AuthService) GetCurrentUserByLogtoSubject(ctx context.Context, logtoUserID string) (*UserResponse, error) {
	sub := logtoUserID
	user, err := s.queries.GetUserByLogtoUserID(ctx, &sub)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, NewNotFound("user mirror not found")
	}
	if err != nil {
		return nil, fmt.Errorf("looking up user by logto subject: %w", err)
	}
	return userToResponse(&user), nil
}

// TournamentStaffAssignment is the response for a user's current tournament staff role.
type TournamentStaffAssignment struct {
	TournamentID   int64  `json:"tournament_id"`
	TournamentName string `json:"tournament_name"`
	Role           string `json:"role"`
}

// GetMyTournamentStaff returns the tournament staff assignment for the given user.
func (s *AuthService) GetMyTournamentStaff(ctx context.Context, userID int64) (*TournamentStaffAssignment, error) {
	row, err := s.queries.GetTournamentStaffByUserID(ctx, userID)
	if err != nil {
		return nil, NewNotFound("no tournament assignment found")
	}
	return &TournamentStaffAssignment{
		TournamentID:   row.TournamentID,
		TournamentName: row.TournamentName,
		Role:           row.Role,
	}, nil
}

// userToResponse maps a generated.User to a safe API response.
// IMPORTANT: Never serialize generated.User directly — it contains password_hash
// with a json tag that would leak the hash. Always use this mapping function.
func userToResponse(u *generated.User) *UserResponse {
	return &UserResponse{
		PublicID:    u.PublicID,
		Email:       u.Email,
		FirstName:   u.FirstName,
		LastName:    u.LastName,
		DisplayName: u.DisplayName,
		DateOfBirth: u.DateOfBirth.Format("2006-01-02"),
		Status:      u.Status,
		Role:        u.Role,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
	}
}
