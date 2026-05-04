# Court Command — Local Smoke Test Checklist

> Walk through this once on a fresh sign-in. Mark each item PASS / FAIL / NOTES.
> Anything FAIL → tell the AI: page URL, what you saw, what you expected, console error if visible (DevTools → Console).

## Prerequisites

- [ ] Stack up: `docker compose -f docker-compose.dev.yml ps` shows 3 healthy containers
- [ ] Backend: `curl http://localhost:8080/api/v1/health` returns `status: ok`
- [ ] Frontend: http://localhost:5173/ responds 200
- [ ] Bootstrap admin: `admin@courtcommand.local` / `TestPass123!`
- [ ] Hard-reload browser to dump service-worker cache: **Cmd-Shift-R** (Mac) / **Ctrl-Shift-R** (Linux/Win)

---

## 1. Public / Anonymous Experience (do these signed OUT first)

If currently signed in: click **Log out** in sidebar.

| # | URL | What to verify |
|---|---|---|
| 1.1 | `/` | Public landing — hero with "Sign In to Get Started" button + news widget + tournaments/leagues/venues directories |
| 1.2 | Top bar visible? Bottom tabs (Home / Events / Live / News / More) at the bottom on mobile width | |
| 1.3 | `/public/tournaments` | Lists 3 seeded tournaments (Spring Slam, Summer Open, Autumn Classic) |
| 1.4 | Click into one tournament | Detail page renders — overview, divisions visible |
| 1.5 | `/public/leagues` | Lists 2 seeded leagues |
| 1.6 | Click into one league | Detail with seasons visible |
| 1.7 | `/public/venues` | Lists 2 venues (Pickleton Community Center, Lone Star Pickleball) |
| 1.8 | Click into one venue | Detail page — info, courts, map (or "Maps unavailable" without API key) |
| 1.9 | `/public/live` | "No live matches" message OR list of currently-live matches |
| 1.10 | `/public/events` | Combined feed of tournaments + leagues |
| 1.11 | Press **Cmd-K** (or click Search button) | Search modal opens |
| 1.12 | Type "Spring" in search | Results show Spring Slam tournament |
| 1.13 | Theme toggle (top right of sidebar/menu) | Light / dark / system cycle works |

---

## 2. Authentication

| # | Action | Verify |
|---|---|---|
| 2.1 | Click "Sign In to Get Started" in PublicHero | Browser redirects to http://localhost:3001/sign-in |
| 2.2 | Enter `admin@courtcommand.local` | Field accepts email |
| 2.3 | Click Continue (if it appears) | Goes to password step |
| 2.4 | Enter `TestPass123!`, click Sign In | Redirects to http://localhost:5173/auth/callback briefly, then to `/pickleball/dashboard` |
| 2.5 | Dashboard renders with "Welcome back, Local" | |
| 2.6 | Sidebar visible on left, fully expanded or collapsed | |
| 2.7 | DevTools → Network: any request to `/api/v1/...` should have `Authorization: Bearer eyJ...` and `X-Sport: pickleball` headers | |

---

## 3. Sidebar Navigation (the critical regression test from Sidebar fix)

Each click should land at the correct URL — NOT bounce to dashboard.

| # | Click | Expected URL | Verify |
|---|---|---|---|
| 3.1 | Home | `/` (auto-redirects authenticated single-sport user back to dashboard — this is intentional behavior) | |
| 3.2 | Dashboard | `/pickleball/dashboard` | |
| 3.3 | My Assets | `/pickleball/manage` | Lists tournaments/leagues/orgs the admin manages |
| 3.4 | Leagues | `/pickleball/leagues` | 2 leagues visible |
| 3.5 | Tournaments | `/pickleball/tournaments` | 3 tournaments visible |
| 3.6 | Venues & Courts | `/pickleball/venues` | 2 venues visible |
| 3.7 | Players | `/pickleball/players` | 24 players (1 admin + 17 unclaimed + 6 staff) |
| 3.8 | Teams | `/pickleball/teams` | 8 teams visible |
| 3.9 | Organizations | `/pickleball/organizations` | 3 orgs visible |
| 3.10 | Ref Console | `/pickleball/ref` | List of courts/matches for refs |
| 3.11 | Scorekeeper | `/pickleball/scorekeeper` | Scorekeeper home |
| 3.12 | Quick Match | `/pickleball/quick-match` | Quick match list |
| 3.13 | Overlay | `/overlay/` (note trailing slash) | Renders OverlayLanding (not redirect to dashboard) |
| 3.14 | Admin | `/pickleball/admin` | Admin landing page |

---

## 4. Dashboard (`/pickleball/dashboard`)

| # | Verify |
|---|---|
| 4.1 | "Welcome back, Local" header |
| 4.2 | Stats summary cards (W/L, recent activity) — even if zero |
| 4.3 | Active Registrations section (likely empty for admin) |
| 4.4 | Upcoming Matches section |
| 4.5 | My Teams section — admin not on any team, so likely empty |
| 4.6 | Recent Results section |
| 4.7 | Dashboard Announcements section (5 seeded announcements) |
| 4.8 | No console errors |

---

## 5. Profile (`/pickleball/profile`)

| # | Verify |
|---|---|
| 5.1 | "Edit profile" header |
| 5.2 | All 8 sections visible: Contact, Pickleball Identity, Equipment, Demographics, Address, Emergency Contact, Medical, Privacy |
| 5.3 | Fill phone with a number (e.g., `555-9876`), click Save |
| 5.4 | Toast appears: "Profile saved" |
| 5.5 | Reload page (F5) |
| 5.6 | Phone field shows the value you saved |
| 5.7 | Try the gender dropdown (Not specified / Male / Female / Non-binary / Prefer not to say) — saves correctly |
| 5.8 | Try date of birth picker — saves correctly |
| 5.9 | Try filling Address line 1 + line 2 + city + state + country + postal code — saves and persists |
| 5.10 | Privacy toggle ("Hide my profile from public directories") — saves |

---

## 6. Tournaments (`/pickleball/tournaments`)

| # | Verify |
|---|---|
| 6.1 | List shows 3 tournaments with dates |
| 6.2 | Click "Spring Slam" → detail page |
| 6.3 | Tabs visible: Overview, Divisions, Courts, Staff, Settings |
| 6.4 | Divisions tab shows seeded divisions |
| 6.5 | Click a division → division detail with registrations + bracket |
| 6.6 | Try Settings tab — name, description, dates editable |
| 6.7 | Try clicking "Create Tournament" button |
| 6.8 | Form accepts a name, select sport=pickleball (single sport), submit |
| 6.9 | New tournament appears in the list |
| 6.10 | Try cloning a tournament (look for Clone button on detail) |

---

## 7. Leagues (`/pickleball/leagues`)

| # | Verify |
|---|---|
| 7.1 | List shows 2 leagues |
| 7.2 | Click into a league → seasons visible |
| 7.3 | Click into a season → standings, registrations, division templates tabs |
| 7.4 | Try creating a league |
| 7.5 | League announcements feed |

---

## 8. Registry (Players, Teams, Orgs, Venues, Courts)

### Players
| # | Verify |
|---|---|
| 8.1 | Players list shows 24 entries |
| 8.2 | Click on Daniel Velez → detail page |
| 8.3 | Search/filter works |

### Teams
| # | Verify |
|---|---|
| 8.4 | Teams list shows 8 teams |
| 8.5 | Click into a team → roster visible |
| 8.6 | Try creating a team (Create button) |

### Organizations
| # | Verify |
|---|---|
| 8.7 | Orgs list shows 3 |
| 8.8 | Click into one → members, blocks tabs |
| 8.9 | Try creating an org |

### Venues
| # | Verify |
|---|---|
| 8.10 | 2 venues visible |
| 8.11 | Click into Pickleton Community Center → courts list (4 courts) |
| 8.12 | Click into Lone Star Pickleball → courts list (4 courts) |
| 8.13 | Map renders OR shows graceful "Maps unavailable" message |

### Courts
| # | Verify |
|---|---|
| 8.14 | Courts page lists 8 courts (court-1 through outdoor-court) |
| 8.15 | Click into "Center Court" (slug `center-court`) → detail with stream embed area, queue, recent results |

---

## 9. Match Operations

| # | Verify |
|---|---|
| 9.1 | Look for matches under a tournament division |
| 9.2 | Click into a match → detail page (hero, info panel, events timeline) |
| 9.3 | Public match scoreboard URL like `/pickleball/matches/<publicId>/scoreboard` renders fullscreen, no shell |
| 9.4 | Match-series detail if any seeded |

---

## 10. Quick Match (`/pickleball/quick-match`)

| # | Verify |
|---|---|
| 10.1 | List shows 2 seeded quick matches |
| 10.2 | Click "New Quick Match" |
| 10.3 | Form: pick court, teams (or create on the fly), scoring preset → start |
| 10.4 | New quick match appears |

---

## 11. Scoring Consoles

### Referee (`/pickleball/ref`)

| # | Verify |
|---|---|
| 11.1 | Court grid / list of assigned courts |
| 11.2 | Click into a court → live scoring UI |
| 11.3 | Scoring buttons (Side Out, Point) work — score increments |
| 11.4 | Serve indicator updates |
| 11.5 | Game history bar shows games so far |
| 11.6 | Keyboard shortcuts (try Space for point, S for side-out — exact bindings in app) |
| 11.7 | Disconnect banner appears if you stop the backend (optional advanced test) |

### Scorekeeper (`/pickleball/scorekeeper`)

| # | Verify |
|---|---|
| 11.8 | List of matches |
| 11.9 | Click in → read-only scoreboard + events timeline |

---

## 12. Brackets, Court Queue, Standings

| # | Verify |
|---|---|
| 12.1 | Tournament division → Bracket tab renders |
| 12.2 | Standings show under league season — even if zeros |
| 12.3 | Court queue visible per court |

---

## 13. Overlay System

### Public overlay (no auth)
| # | URL | Verify |
|---|---|---|
| 13.1 | `/overlay/court/center-court` | Transparent background scoreboard renders. No app shell. Works for OBS browser source |
| 13.2 | `/overlay/demo/<theme-id>` | Demo overlay with mock data — try `default` theme |

### Overlay control panel (admin)
| # | URL | Verify |
|---|---|---|
| 13.3 | `/overlay/court/center-court/settings` | **Settings page renders, doesn't crash.** This was the bug we just fixed. |
| 13.4 | Tabs: Elements / Theme / Source / Triggers / Overrides / OBS URL all clickable |
| 13.5 | Elements tab — toggle scoreboard visibility, save, see preview update |
| 13.6 | Theme tab — pick a theme, preview changes |
| 13.7 | OBS URL tab — generate a token, URL appears, can copy |
| 13.8 | Layout mode toggle (Auto / Top / Side) works |

### Producer Monitor + Setup Wizard
| # | URL | Verify |
|---|---|---|
| 13.9 | `/overlay/monitor` | Producer monitor UI |
| 13.10 | `/overlay/setup` | Setup wizard |
| 13.11 | `/overlay/source-profiles` | Source profile list |

---

## 14. TV / Kiosk Displays

| # | URL | Verify |
|---|---|---|
| 14.1 | `/tv/courts/center-court` | Fullscreen court display, no shell |
| 14.2 | `/tv/tournaments/<id>` | Fullscreen tournament display, no shell |

---

## 15. Admin Platform (platform_admin only)

| # | URL | Verify |
|---|---|---|
| 15.1 | `/pickleball/admin` | Admin landing |
| 15.2 | `/pickleball/admin/users` | User search — 24 users |
| 15.3 | Click into a user → detail page |
| 15.4 | Try changing role / status (don't break the admin user!) |
| 15.5 | `/pickleball/admin/activity` | Activity log entries |
| 15.6 | `/pickleball/admin/settings` | Site settings — Ghost CMS toggle, Maps API key |
| 15.7 | `/pickleball/admin/uploads` | Upload browser |
| 15.8 | `/pickleball/admin/ads` | Ad manager — 3 seeded ad configs |
| 15.9 | `/pickleball/admin/api-keys` | 2 seeded API keys |
| 15.10 | `/pickleball/admin/venues` | Venue approval list |
| 15.11 | **Impersonation: do NOT click — this is documented as ⚠️ broken under JWT** (see FEATURES.md §2 / §20) |

---

## 16. Cross-Cutting / UX

| # | Verify |
|---|---|
| 16.1 | Sidebar collapse / expand button works (left edge) |
| 16.2 | Sidebar collapsed state persists across reloads (localStorage) |
| 16.3 | Mobile width: sidebar disappears, top bar + bottom tabs appear (resize to <768px) |
| 16.4 | Toast notifications work (any successful save) |
| 16.5 | Error toasts work (try saving an invalid form) |
| 16.6 | Modal dismiss (Esc key, overlay click) |
| 16.7 | Confirm dialog appears before destructive actions (e.g., delete a team) |
| 16.8 | Offline banner: stop backend → banner appears within ~30s |
| 16.9 | Switch sport link in sidebar → goes to `/` (sport picker / public landing) |
| 16.10 | Sign out → returns to `/`, no auth on next request |

---

## 17. Edge Cases & Known Issues

| # | Test | Expected behavior |
|---|---|---|
| 17.1 | Manually edit URL to `/foo/dashboard` (unknown sport) | Bounces to `/` (sport picker / public landing) |
| 17.2 | Manually edit URL to `/demo_sport/dashboard` | **Currently** would bounce to `/` because demo_sport is_active=false. Whatever happens, no crash. |
| 17.3 | Hard-reload while on a sport-scoped page | Page reloads cleanly, JWT still valid, content renders |
| 17.4 | Open two tabs, log out in one | The other tab eventually redirects to sign-in (on next API call) |
| 17.5 | Manually edit URL to `/pickleball/<random-garbage>` | 404 "Page not found" |
| 17.6 | URL `/auth/callback` without query params (e.g., from history) | Either re-authenticates or goes to `/` cleanly |

---

## 18. Performance / Quick Visual Check

| # | Verify |
|---|---|
| 18.1 | Initial load < 3s on local |
| 18.2 | Sidebar feels instant on click |
| 18.3 | No flash of unstyled content (FOUC) |
| 18.4 | No layout shift when sidebar collapse |
| 18.5 | DevTools → Network: no 500-class errors during normal browsing |
| 18.6 | DevTools → Console: no red errors during normal browsing (yellow warnings are usually OK) |

---

## After You're Done

For every FAIL, paste to the AI:

1. **Section/item number** (e.g., 13.5)
2. **URL** you were on
3. **What you did** (clicked X, filled Y, etc.)
4. **What you saw** (text on screen, screenshot if helpful)
5. **What you expected**
6. **Console errors** if visible (DevTools → Console → red lines)
7. **Network errors** if visible (DevTools → Network → 4xx/5xx rows)

The AI will mark each issue in `docs/FEATURES.md` and queue the fix.

When everything passes, you've validated the full Phase 3+3.5+3.6+3.7 surface and we can decide whether to proceed with Phase 6 cleanup, the rewrite (C2 separate branch), or Phase 4 features.
