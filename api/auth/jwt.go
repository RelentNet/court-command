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

// jwksCacheTTL is how long a fetched JWKS is reused before we refetch from
// the issuer. Logto rotates signing keys infrequently; an hour balances
// freshness against load on the auth server.
const jwksCacheTTL = time.Hour

// orgAudiencePrefix is the prefix Logto stamps onto org-scoped access tokens.
// Tokens with audience starting with this prefix are accepted when callers
// pass orgScoped=true to Validate.
const orgAudiencePrefix = "urn:logto:organization:"

// Validator parses and verifies JWTs issued by a Logto tenant. The set of
// signing keys is fetched lazily from the configured JWKS endpoint and cached
// for jwksCacheTTL between refreshes.
type Validator struct {
	issuer   string
	jwksURI  string
	audience string

	mu        sync.Mutex
	cachedSet jwk.Set
	cachedAt  time.Time
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
	}
}

// Validate parses tokenString, verifies its signature against the cached
// JWKS, checks the issuer matches the configured issuer, and asserts the
// audience is acceptable. When orgScoped is true the token is also accepted
// if its audience begins with urn:logto:organization:; otherwise the audience
// must equal the Validator's configured audience exactly.
func (v *Validator) Validate(ctx context.Context, tokenString string, orgScoped bool) (jwt.Token, error) {
	keyset, err := v.getKeySet(ctx)
	if err != nil {
		return nil, fmt.Errorf("auth: load JWKS: %w", err)
	}

	tok, err := jwt.Parse(
		[]byte(tokenString),
		jwt.WithKeySet(keyset),
		jwt.WithValidate(true),
		jwt.WithIssuer(v.issuer),
	)
	if err != nil {
		return nil, fmt.Errorf("auth: parse token: %w", err)
	}

	if err := v.checkAudience(tok, orgScoped); err != nil {
		return nil, err
	}

	return tok, nil
}

// checkAudience enforces the audience policy described on Validate. A token
// with no audience claim at all is rejected.
func (v *Validator) checkAudience(tok jwt.Token, orgScoped bool) error {
	aud, ok := tok.Audience()
	if !ok || len(aud) == 0 {
		return fmt.Errorf("auth: token missing audience claim")
	}
	for _, a := range aud {
		if a == v.audience {
			return nil
		}
		if orgScoped && strings.HasPrefix(a, orgAudiencePrefix) {
			return nil
		}
	}
	return fmt.Errorf("auth: token audience %v does not match expected %q (orgScoped=%t)", aud, v.audience, orgScoped)
}

// getKeySet returns the cached JWKS, refetching from the JWKS endpoint when
// the cache is empty or stale. Refresh is mutex-protected so concurrent
// requests after expiry coalesce into a single fetch.
func (v *Validator) getKeySet(ctx context.Context) (jwk.Set, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if v.cachedSet != nil && time.Since(v.cachedAt) < jwksCacheTTL {
		return v.cachedSet, nil
	}

	set, err := jwk.Fetch(ctx, v.jwksURI)
	if err != nil {
		// On refresh failure, fall back to the stale cache rather than
		// rejecting every in-flight request — better availability while
		// the issuer is briefly unreachable.
		if v.cachedSet != nil {
			return v.cachedSet, nil
		}
		return nil, fmt.Errorf("fetch %s: %w", v.jwksURI, err)
	}

	v.cachedSet = set
	v.cachedAt = time.Now()
	return set, nil
}
