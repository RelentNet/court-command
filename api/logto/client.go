// Package logto wraps the self-hosted Logto Management API: cached M2M
// access tokens plus authenticated JSON calls.
package logto

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// tokenSafetyMargin is subtracted from expires_in so we refresh ahead of real expiry.
const tokenSafetyMargin = 10 * time.Second
const defaultHTTPTimeout = 10 * time.Second

// Config carries the inputs NewClient needs. Endpoint is the Logto core URL
// without trailing slash. ManagementAPIResource is the OAuth resource
// indicator (audience); for self-hosted Logto it is the fixed value
// "https://default.logto.app/api" -- not a real URL, just Logto's built-in
// management API audience. HTTPClient is optional.
type Config struct {
	Endpoint, ManagementAPIAppID, ManagementAPIAppSecret, ManagementAPIResource string
	HTTPClient                                                                  *http.Client
}

// Client is a thin wrapper around the Logto Management API. Safe for
// concurrent use; the cached management token is mutex-protected.
type Client struct {
	cfg         Config
	http        *http.Client
	mu          sync.Mutex
	cachedToken string
	cachedUntil time.Time
}

// NewClient builds a Client from cfg, defaulting HTTPClient to a 10s timeout.
func NewClient(cfg Config) *Client {
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: defaultHTTPTimeout}
	}
	return &Client{cfg: cfg, http: hc}
}

// APIError is returned for non-2xx Management API responses. errors.As to
// branch on Status (e.g. 404).
type APIError struct {
	Status int
	Body   string
}

func (e *APIError) Error() string { return fmt.Sprintf("logto API status %d: %s", e.Status, e.Body) }

// GetManagementToken returns a valid M2M access token, minting a new one
// via OAuth2 client_credentials when the cached value is missing or
// expired. The mutex is held across the network round-trip; token requests
// are infrequent so refresh-stampede coalescing is desirable.
func (c *Client) GetManagementToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cachedToken != "" && time.Now().Before(c.cachedUntil) {
		return c.cachedToken, nil
	}

	form := url.Values{"grant_type": {"client_credentials"}, "resource": {c.cfg.ManagementAPIResource}, "scope": {"all"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.cfg.Endpoint+"/oidc/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(c.cfg.ManagementAPIAppID, c.cfg.ManagementAPIAppSecret)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read token response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return "", &APIError{Status: resp.StatusCode, Body: string(body)}
	}
	var parsed struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}
	if parsed.AccessToken == "" {
		return "", fmt.Errorf("token response missing access_token")
	}
	c.cachedToken = parsed.AccessToken
	c.cachedUntil = time.Now().Add(time.Duration(parsed.ExpiresIn)*time.Second - tokenSafetyMargin)
	return c.cachedToken, nil
}

// doJSON issues an authenticated Management API request. body, if non-nil,
// is JSON-encoded with Content-Type: application/json. out, if non-nil,
// receives the JSON-decoded response. Non-2xx responses become *APIError.
func (c *Client) doJSON(ctx context.Context, method, path string, body, out any) error {
	token, err := c.GetManagementToken(ctx)
	if err != nil {
		return err
	}
	var reqBody io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("encode request: %w", err)
		}
		reqBody = bytes.NewReader(buf)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.cfg.Endpoint+path, reqBody)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", method, path, err)
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return &APIError{Status: resp.StatusCode, Body: string(respBody)}
	}
	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}
