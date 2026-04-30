package auth

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"
)

// defaultKeyTTL is how long a fetched JWKS is reused before we refetch from
// the issuer. Logto rotates signing keys infrequently; an hour balances
// freshness against load on the auth server. Per-Validator override via
// SetKeyTTL is provided so tests can force a refresh without sleeping.
const defaultKeyTTL = time.Hour

// jwksFetchTimeout caps how long getKeySet will wait on the JWKS endpoint
// before giving up. The validator mutex is held across the fetch, so an
// unbounded wait against a hung issuer would stall every concurrent caller.
const jwksFetchTimeout = 10 * time.Second

// orgAudiencePrefix is the prefix Logto stamps onto org-scoped access tokens.
// Tokens with audience starting with this prefix are accepted when callers
// pass orgScoped=true to Validate.
const orgAudiencePrefix = "urn:logto:organization:"

// Validator parses and verifies JWTs issued by a Logto tenant. The set of
// signing keys is fetched lazily from the configured JWKS endpoint and cached
// for keyTTL between refreshes.
type Validator struct {
	issuer   string
	jwksURI  string
	audience string

	mu        sync.Mutex
	cachedSet jwk.Set
	cachedAt  time.Time
	keyTTL    time.Duration
}

// NewValidator builds a Validator scoped to the given Logto tenant. issuer
// must match the iss claim of incoming tokens; jwksURI is the .well-known
// JWKS URL; audience is the resource indicator the API was registered with
// in Logto (used as the default audience when orgScoped is false).
func NewValidator(issuer, jwksURI, audience string) *Validator {
	return &Validator{
		issuer:   issuer,
		jwksURI:  jwksURI,
		audience: audience,
		keyTTL:   defaultKeyTTL,
	}
}

// SetKeyTTL overrides how long a fetched JWKS is cached before a refetch.
// Intended for tests that need to force a JWKS refresh deterministically;
// production code should rely on the default TTL set in NewValidator.
func (v *Validator) SetKeyTTL(d time.Duration) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.keyTTL = d
}

// Validate parses tokenString, verifies its signature against the cached
// JWKS, checks the issuer matches the configured issuer, and asserts the
// audience is acceptable. When orgScoped is true the token is also accepted
// if its audience begins with urn:logto:organization:; otherwise the audience
// must equal the Validator's configured audience exactly. The returned
// Claims is the normalized, jwx-free shape downstream handlers consume.
func (v *Validator) Validate(ctx context.Context, tokenString string, orgScoped bool) (Claims, error) {
	keyset, err := v.getKeySet(ctx)
	if err != nil {
		return Claims{}, fmt.Errorf("load JWKS: %w", err)
	}

	tok, err := jwt.Parse(
		[]byte(tokenString),
		jwt.WithKeySet(keyset),
		jwt.WithValidate(true),
		jwt.WithIssuer(v.issuer),
	)
	if err != nil {
		return Claims{}, fmt.Errorf("parse token: %w", err)
	}

	if err := v.checkAudience(tok, orgScoped); err != nil {
		return Claims{}, err
	}

	return ExtractClaims(tok), nil
}

// checkAudience enforces the audience policy described on Validate. A token
// with no audience claim at all is rejected.
func (v *Validator) checkAudience(tok jwt.Token, orgScoped bool) error {
	aud, ok := tok.Audience()
	if !ok || len(aud) == 0 {
		return fmt.Errorf("token missing audience claim")
	}
	for _, a := range aud {
		if a == v.audience {
			return nil
		}
		if orgScoped && strings.HasPrefix(a, orgAudiencePrefix) {
			return nil
		}
	}
	return fmt.Errorf("token audience %v does not match expected %q (orgScoped=%t)", aud, v.audience, orgScoped)
}

// getKeySet returns the cached JWKS, refetching from the JWKS endpoint when
// the cache is empty or stale. Refresh is mutex-protected so concurrent
// requests after expiry coalesce into a single fetch. The fetch itself runs
// against a derived context with jwksFetchTimeout so a hung issuer can't
// stall the mutex for the lifetime of the caller's context.
func (v *Validator) getKeySet(ctx context.Context) (jwk.Set, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if v.cachedSet != nil && time.Since(v.cachedAt) < v.keyTTL {
		return v.cachedSet, nil
	}

	fetchCtx, cancel := context.WithTimeout(ctx, jwksFetchTimeout)
	defer cancel()

	set, err := jwk.Fetch(fetchCtx, v.jwksURI)
	if err != nil {
		// On refresh failure, fall back to the stale cache rather than
		// rejecting every in-flight request — better availability while
		// the issuer is briefly unreachable.
		if v.cachedSet != nil {
			return v.cachedSet, nil
		}
		return nil, fmt.Errorf("fetch jwks: %w", err)
	}

	v.cachedSet = set
	v.cachedAt = time.Now()
	return set, nil
}
