// api/config/config.go
package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the application.
type Config struct {
	DatabaseURL        string
	RedisURL           string
	Port               string
	CORSAllowedOrigins []string
	Env                string // "development", "production"
}

// Load reads configuration from environment variables.
// It loads .env file if present (development convenience).
func Load() (*Config, error) {
	// Load .env file if it exists (ignore error if missing)
	_ = godotenv.Load("../.env")

	cfg := &Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		RedisURL:    os.Getenv("REDIS_URL"),
		Port:        os.Getenv("PORT"),
		Env:         os.Getenv("APP_ENV"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.RedisURL == "" {
		return nil, fmt.Errorf("REDIS_URL is required")
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if cfg.Env == "" {
		cfg.Env = "development"
	}

	origins := os.Getenv("CORS_ALLOWED_ORIGINS")
	if origins != "" {
		cfg.CORSAllowedOrigins = strings.Split(origins, ",")
	}

	return cfg, nil
}

// IsDevelopment returns true if running in development mode. Treats
// empty Env (the default) as development so an unconfigured local
// stack doesn't accidentally trip production-only safety checks.
func (c *Config) IsDevelopment() bool {
	return c.Env == "" || c.Env == "development" || c.Env == "dev" || c.Env == "local"
}

// IsProduction returns true when running in production mode. Anything
// that isn't a recognized dev marker counts as production -- this is
// the safe default so a misspelled APP_ENV (e.g. "prod" or "staging")
// still triggers production-only safety checks like the Logto Mgmt
// API fail-fast.
func (c *Config) IsProduction() bool {
	return !c.IsDevelopment()
}
