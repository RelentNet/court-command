// api/middleware/rate_limit.go
package middleware

import (
	"net/http"
	"sync"
	"time"
)

// RateLimiter is a simple in-memory token-bucket rate limiter keyed by IP.
type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     int           // tokens added per interval
	burst    int           // max tokens
	interval time.Duration // refill interval
	done     chan struct{}
}

type visitor struct {
	tokens   int
	lastSeen time.Time
}

// NewRateLimiter creates a new rate limiter.
// rate is the number of requests allowed per interval, burst is the max burst size.
func NewRateLimiter(rate, burst int, interval time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		rate:     rate,
		burst:    burst,
		interval: interval,
		done:     make(chan struct{}),
	}
	go rl.cleanup()
	return rl
}

// Stop shuts down the cleanup goroutine.
func (rl *RateLimiter) Stop() {
	close(rl.done)
}

// cleanup periodically removes stale visitors.
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-rl.done:
			return
		case <-ticker.C:
			rl.mu.Lock()
			for ip, v := range rl.visitors {
				if time.Since(v.lastSeen) > 10*time.Minute {
					delete(rl.visitors, ip)
				}
			}
			rl.mu.Unlock()
		}
	}
}

// allow checks whether a request from the given key should be allowed.
func (rl *RateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[key]
	if !exists {
		rl.visitors[key] = &visitor{tokens: rl.burst - 1, lastSeen: time.Now()}
		return true
	}

	// Refill tokens based on whole intervals elapsed; preserve the remainder.
	// Advancing lastSeen unconditionally to now() would discard the
	// sub-interval fractional time, so a client polling more often than once
	// per interval would never accrue a full interval and could never refill.
	elapsed := time.Since(v.lastSeen)
	if intervals := int(elapsed / rl.interval); intervals > 0 {
		v.tokens += intervals * rl.rate
		if v.tokens > rl.burst {
			v.tokens = rl.burst
		}
		// Advance lastSeen only by the whole intervals consumed, so the
		// leftover fractional time still counts toward the next refill.
		v.lastSeen = v.lastSeen.Add(time.Duration(intervals) * rl.interval)
	}

	if v.tokens <= 0 {
		return false
	}
	v.tokens--
	return true
}

// RateLimit returns middleware that limits requests by client IP.
func RateLimit(rate, burst int, interval time.Duration) func(http.Handler) http.Handler {
	limiter := NewRateLimiter(rate, burst, interval)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Use r.RemoteAddr directly — chi's RealIP middleware (in the global
			// stack) has already resolved the true client IP from trusted proxy
			// headers. Do NOT read X-Forwarded-For here; it's user-spoofable.
			key := r.RemoteAddr

			if !limiter.allow(key) {
				w.Header().Set("Retry-After", "60")
				writeError(w, http.StatusTooManyRequests, "rate_limited", "too many requests")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
