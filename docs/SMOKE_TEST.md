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
# This is good, but its never accessible once signed in. Shouldnt we allow it?
| 1.2 | Top bar visible? Bottom tabs (Home / Events / Live / News / More) at the bottom on mobile width | |
#Only when signed out
| 1.3 | `/public/tournaments` | Lists 3 seeded tournaments (Spring Slam, Summer Open, Autumn Classic) |
#good to go
| 1.4 | Click into one tournament | Detail page renders — overview, divisions visible |
#good to go
| 1.5 | `/public/leagues` | Lists 2 seeded leagues |
#good to go
| 1.6 | Click into one league | Detail with seasons visible |
#good to go
| 1.7 | `/public/venues` | Lists 2 venues (Pickleton Community Center, Lone Star Pickleball) |
#good to go
| 1.8 | Click into one venue | Detail page — info, courts, map (or "Maps unavailable" without API key) |
#good to go
| 1.9 | `/public/live` | "No live matches" message OR list of currently-live matches |
#the page is good but there is no easy way to get to it while logged in
| 1.10 | `/public/events` | Combined feed of tournaments + leagues |
#the page is good but there is no easy way to get to it while logged in
| 1.11 | Press **Cmd-K** (or click Search button) | Search modal opens |
#search modal opens
| 1.12 | Type "Spring" in search | Results show Spring Slam tournament |
#this does not work, and it seems like it is trying to live search which once it tries it blancks out the page completely
| 1.13 | Theme toggle (top right of sidebar/menu) | Light / dark / system cycle works |
#themes work

---

## 2. Authentication

| # | Action | Verify |
|---|---|---|
| 2.1 | Click "Sign In to Get Started" in PublicHero | Browser redirects to http://localhost:3001/sign-in |
#good to go
| 2.2 | Enter `admin@courtcommand.local` | Field accepts email |
#good to go
| 2.3 | Click Continue (if it appears) | Goes to password step |
#good to go
| 2.4 | Enter `TestPass123!`, click Sign In | Redirects to http://localhost:5173/auth/callback briefly, then to `/pickleball/dashboard` |
#good to go
| 2.5 | Dashboard renders with "Welcome back, Local" | |
#it does render Welcome back, Local but it is far to tiny. and font color is too subdued.
| 2.6 | Sidebar visible on left, fully expanded or collapsed | |
#both are visible
| 2.7 | DevTools → Network: any request to `/api/v1/...` should have `Authorization: Bearer eyJ...` and `X-Sport: pickleball` headers | |
# not sure where to test this

---

## 3. Sidebar Navigation (the critical regression test from Sidebar fix)

Each click should land at the correct URL — NOT bounce to dashboard.

| # | Click | Expected URL | Verify |
|---|---|---|---|
| 3.1 | Home | `/` (auto-redirects authenticated single-sport user back to dashboard — this is intentional behavior) | |
#works as intended but wondering if home should have its own page that lets users hav see the logged out home page, that also lets use make announcements. 
| 3.2 | Dashboard | `/pickleball/dashboard` | |
#good to go
| 3.3 | My Assets | `/pickleball/manage` | Lists tournaments/leagues/orgs the admin manages |
#good to go
| 3.4 | Leagues | `/pickleball/leagues` | 2 leagues visible |
#good to go
| 3.5 | Tournaments | `/pickleball/tournaments` | 3 tournaments visible |
#good to go
| 3.6 | Venues & Courts | `/pickleball/venues` | 2 venues visible |
#good to go
| 3.7 | Players | `/pickleball/players` | 24 players (1 admin + 17 unclaimed + 6 staff) |
#good to go
| 3.8 | Teams | `/pickleball/teams` | 8 teams visible |
#good to go
| 3.9 | Organizations | `/pickleball/organizations` | 3 orgs visible |
#good to go
| 3.10 | Ref Console | `/pickleball/ref` | List of courts/matches for refs |
#good to go
| 3.11 | Scorekeeper | `/pickleball/scorekeeper` | Scorekeeper home |
#good to go
| 3.12 | Quick Match | `/pickleball/quick-match` | Quick match list |
#good to go but no matches to show
| 3.13 | Overlay | `/overlay/` (note trailing slash) | Renders OverlayLanding (not redirect to dashboard) |
#good to go
| 3.14 | Admin | `/pickleball/admin` | Admin landing page |
#good to go

---

## 4. Dashboard (`/pickleball/dashboard`)

| # | Verify |
|---|---|
| 4.1 | "Welcome back, Local" header |
#It is there, could be visually more appealing.
| 4.2 | Stats summary cards (W/L, recent activity) — even if zero |
#it shows
| 4.3 | Active Registrations section (likely empty for admin) |
#it is there
| 4.4 | Upcoming Matches section |
#it is there
| 4.5 | My Teams section — admin not on any team, so likely empty |
#it is there
| 4.6 | Recent Results section |
#it is there
| 4.7 | Dashboard Announcements section (5 seeded announcements) |
#it is there
| 4.8 | No console errors |
#none that i see so far.

---

## 5. Profile (`/pickleball/profile`)

| # | Verify |
|---|---|
| 5.1 | "Edit profile" header |
# The header is there.
| 5.2 | All 8 sections visible: Contact, Pickleball Identity, Equipment, Demographics, Address, Emergency Contact, Medical, Privacy |
#all there
| 5.3 | Fill phone with a number (e.g., `555-9876`), click Save |
#was able to write and then clicked saved but  then when the page reloaded it reloaded with the old number. 
| 5.4 | Toast appears: "Profile saved" |
#this does appear
| 5.5 | Reload page (F5) |
#once I reloaded with F5 i now see the new number we saved. 
| 5.6 | Phone field shows the value you saved |
#yes
| 5.7 | Try the gender dropdown (Not specified / Male / Female / Non-binary / Prefer not to say) — saves correctly |
#yes i see these, and i can save but it seems no values show after initial save button is clicked until i f5 and refresh, users could get confused. 
| 5.8 | Try date of birth picker — saves correctly |
#worked
| 5.9 | Try filling Address line 1 + line 2 + city + state + country + postal code — saves and persists |
#works but shouldnt this be the same address style as all others with googles api. 
| 5.10 | Privacy toggle ("Hide my profile from public directories") — saves |
#it saves and reflects after F5

---

## 6. Tournaments (`/pickleball/tournaments`)

| # | Verify |
|---|---|
| 6.1 | List shows 3 tournaments with dates |
#See all 3
| 6.2 | Click "Spring Slam" → detail page |
#Summer Slam 2026 
| 6.3 | Tabs visible: Overview, Divisions, Courts, Staff, Settings |
#I see these and registration and announcements
| 6.4 | Divisions tab shows seeded divisions |
#Yes
| 6.5 | Click a division → division detail with registrations + bracket |
#I see this
| 6.6 | Try Settings tab — name, description, dates editable |
#I see these things
| 6.7 | Try clicking "Create Tournament" button |
#Works
| 6.8 | Form accepts a name, select sport=pickleball (single sport), submit |
#works
| 6.9 | New tournament appears in the list |
#works
| 6.10 | Try cloning a tournament (look for Clone button on detail) |
#work

---

## 7. Leagues (`/pickleball/leagues`)

| # | Verify |
|---|---|
| 7.1 | List shows 2 leagues |
#gtg
| 7.2 | Click into a league → seasons visible |
#gtg
| 7.3 | Click into a season → standings, registrations, division templates tabs |
#gtg
| 7.4 | Try creating a league |
#gtg
| 7.5 | League announcements feed |
#gtg

---

## 8. Registry (Players, Teams, Orgs, Venues, Courts)

### Players
| # | Verify |
|---|---|
| 8.1 | Players list shows 24 entries |
#This does work but DUPR is showing in the List, DUPR is fine but VAIR will be our prefered partner, while we are agnostic VAIR has expressed love for our product, and a want to work with us. 
| 8.2 | Click on Daniel Velez → detail page |
#I do see the details page
| 8.3 | Search/filter works |
#Search does work. 

### Teams
| # | Verify |
|---|---|
| 8.4 | Teams list shows 8 teams |
#gtg
| 8.5 | Click into a team → roster visible |
#gtg
| 8.6 | Try creating a team (Create button) |
#gtg but the form does not show when it is completed. I need some kinda confirmation besides the form just going blank. 

### Organizations
| # | Verify |
|---|---|
| 8.7 | Orgs list shows 3 |
#gtg
| 8.8 | Click into one → members, blocks tabs |
#gtg
| 8.9 | Try creating an org |
#gtg

### Venues
| # | Verify |
|---|---|
| 8.10 | 2 venues visible |
##gtg
| 8.11 | Click into Pickleton Community Center → courts list (4 courts) |
##gtg
| 8.12 | Click into Lone Star Pickleball → courts list (4 courts) |
##gtg
| 8.13 | Map renders OR shows graceful "Maps unavailable" message |
#map unavailable is what I get but this is probably because of the API key missing.

### Courts
| # | Verify |
|---|---|
| 8.14 | Courts page lists 8 courts (court-1 through outdoor-court) |
#gtg
| 8.15 | Click into "Center Court" (slug `center-court`) → detail with stream embed area, queue, recent results |
#all details are there except, it shows that its live but I dont see an embed of the video. Not sure why not. 
---

## 9. Match Operations

| # | Verify |
|---|---|
| 9.1 | Look for matches under a tournament division |
#gtg but its under courts, for now this is good. Might want both court and matches in the future to be able to see them both but for now this will do. 
| 9.2 | Click into a match → detail page (hero, info panel, events timeline) |
#gtg
| 9.3 | Public match scoreboard URL like `/pickleball/matches/<publicId>/scoreboard` renders fullscreen, no shell |
#scoreboard comes up with direct URL, but there is no way via navigation to get to the scoreboard url, maybe this can live in the overlay area or the matches area or both. 
| 9.4 | Match-series detail if any seeded |
#gtg

---

## 10. Quick Match (`/pickleball/quick-match`)

| # | Verify |
|---|---|
| 10.1 | List shows 2 seeded quick matches |
#there is not quick matches seeded. 
| 10.2 | Click "New Quick Match" |
#I can create and it does show in the list after.
| 10.3 | Form: pick court, teams (or create on the fly), scoring preset → start |
#gtg
| 10.4 | New quick match appears |
#gtg
---

## 11. Scoring Consoles

### Referee (`/pickleball/ref`)

| # | Verify |
|---|---|
| 11.1 | Court grid / list of assigned courts |
#gtg
| 11.2 | Click into a court → live scoring UI |
#gtg
| 11.3 | Scoring buttons (Side Out, Point) work — score increments |
##gtg
| 11.4 | Serve indicator updates |
#gtg
| 11.5 | Game history bar shows games so far |
#this does not seem to appear under the ref area. It seems like the ref area has been stripped down alot from what it used to be. it looks more like what the scorekeeper interface should look like. Ref should have all the verball calls he can make on the tablet interface as well. and the log. 
| 11.6 | Keyboard shortcuts (try Space for point, S for side-out — exact bindings in app) |
#S works but space for bindings does not. 
| 11.7 | Disconnect banner appears if you stop the backend (optional advanced test) |
#This does show.

### Scorekeeper (`/pickleball/scorekeeper`)

| # | Verify |
|---|---|
| 11.8 | List of matches |
#gtg
| 11.9 | Click in → read-only scoreboard + events timeline |
#This scoreboard works, exactly the way it should work, point, side out, undo, timeout all work and nothing else is visible. 

---

## 12. Brackets, Court Queue, Standings

| # | Verify |
|---|---|
| 12.1 | Tournament division → Bracket tab renders |
#gtg
| 12.2 | Standings show under league season — even if zeros |
#gtg
| 12.3 | Court queue visible per court |
#gtg

---

## 13. Overlay System

### Public overlay (no auth)
| # | URL | Verify |
|---|---|---|
| 13.1 | `/overlay/court/center-court` | Transparent background scoreboard renders. No app shell. Works for OBS browser source |
#gtg
| 13.2 | `/overlay/demo/<theme-id>` | Demo overlay with mock data — try `default` theme |
#gtg 

### Overlay control panel (admin)
| # | URL | Verify |
|---|---|---|
| 13.3 | `/overlay/court/center-court/settings` | **Settings page renders, doesn't crash.** This was the bug we just fixed. |
#This is perfect, however I dont like how the saving dialogue currently pops up right under the tabs as it pushes the whole page and then goes back after it disapears again. Can we make it a little popup green modal like you already do. 
| 13.4 | Tabs: Elements / Theme / Source / Triggers / Overrides / OBS URL all clickable |
#gtg
| 13.5 | Elements tab — toggle scoreboard visibility, save, see preview update |
#gtg
| 13.6 | Theme tab — pick a theme, preview changes |
#gtg
| 13.7 | OBS URL tab — generate a token, URL appears, can copy |
#gtg
| 13.8 | Layout mode toggle (Auto / Top / Side) works |
#gtg

### Producer Monitor + Setup Wizard
| # | URL | Verify |
|---|---|---|
| 13.9 | `/overlay/monitor` | Producer monitor UI |
#gtg
| 13.10 | `/overlay/setup` | Setup wizard |
#gtg
| 13.11 | `/overlay/source-profiles` | Source profile list |
#gtg

---

## 14. TV / Kiosk Displays

| # | URL | Verify |
|---|---|---|
| 14.1 | `/tv/courts/center-court` | Fullscreen court display, no shell |
#this works but need an easy way to navigate to it. Maybe under the courts page? 
| 14.2 | `/tv/tournaments/<id>` | Fullscreen tournament display, no shell |
#this works but it is not themed properly will need a dark background. We will implemement a way to add a sponsor to this and theme it later but for now I need it to have a dark background go with the court command default for dark mode. 

---

## 15. Admin Platform (platform_admin only)

| # | URL | Verify |
|---|---|---|
| 15.1 | `/pickleball/admin` | Admin landing |
#gtg
| 15.2 | `/pickleball/admin/users` | User search — 24 users |
#gtg
| 15.3 | Click into a user → detail page |
#gtg
| 15.4 | Try changing role / status (don't break the admin user!) |
#gtg
| 15.5 | `/pickleball/admin/activity` | Activity log entries |
#gtg
| 15.6 | `/pickleball/admin/settings` | Site settings — Ghost CMS toggle, Maps API key |
#gtg
| 15.7 | `/pickleball/admin/uploads` | Upload browser |
#gtg
| 15.8 | `/pickleball/admin/ads` | Ad manager — 3 seeded ad configs |
#gtg
| 15.9 | `/pickleball/admin/api-keys` | 2 seeded API keys |
#only see one here, does this populate from logto and is it authenticated via logto?
| 15.10 | `/pickleball/admin/venues` | Venue approval list |
#gtg
| 15.11 | **Impersonation: do NOT click — this is documented as ⚠️ broken under JWT** (see FEATURES.md §2 / §20) |
#the button for this is not there but we can worry about this whent we implement which should be the next thing we implement. after testing. Then we need to implement the VAIR rating api, I have documentation. I also am thinking of allowing a SSO with VAIR and eventually allowing users to do directly to their VAIR dashboard from our their CC dashboard. 

---

## 16. Cross-Cutting / UX

| # | Verify |
|---|---|
| 16.1 | Sidebar collapse / expand button works (left edge) |
#This Works
| 16.2 | Sidebar collapsed state persists across reloads (localStorage) |
#this works
| 16.3 | Mobile width: sidebar disappears, top bar + bottom tabs appear (resize to <768px) |
#Sidebar stays and bottom tabs are not currently appearing as they should. 
| 16.4 | Toast notifications work (any successful save) |
#this does work except it should be the way our saves under overlay elements popup which i commented above. 
| 16.5 | Error toasts work (try saving an invalid form) |
#gtg
| 16.6 | Modal dismiss (Esc key, overlay click) |
#gtg
| 16.7 | Confirm dialog appears before destructive actions (e.g., delete a team) |
#gtg
| 16.8 | Offline banner: stop backend → banner appears within ~30s |
#gtg
| 16.9 | Switch sport link in sidebar → goes to `/` (sport picker / public landing) |
#gtg
| 16.10 | Sign out → returns to `/`, no auth on next request |
# i can logout it seem but it goes to this. -  http://localhost:3001/oidc/session/end?client_id=va4v6kxbe5azd501e9oqp&post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A5173%2F

---

## 17. Edge Cases & Known Issues

| # | Test | Expected behavior |
|---|---|---|
| 17.1 | Manually edit URL to `/foo/dashboard` (unknown sport) | Bounces to `/` (sport picker / public landing) |
#gtg
| 17.2 | Manually edit URL to `/demo_sport/dashboard` | **Currently** would bounce to `/` because demo_sport is_active=false. Whatever happens, no crash. |
#gtg
| 17.3 | Hard-reload while on a sport-scoped page | Page reloads cleanly, JWT still valid, content renders |
#gtg
| 17.4 | Open two tabs, log out in one | The other tab eventually redirects to sign-in (on next API call) |
#this works but if I click on something on the other window it still lets me go to those other urls just errors out instead of redirecting me to some kind of public page. 
| 17.5 | Manually edit URL to `/pickleball/<random-garbage>` | 404 "Page not found" |
#gtg
| 17.6 | URL `/auth/callback` without query params (e.g., from history) | Either re-authenticates or goes to `/` cleanly |
it just stays in a blank page with that url, however if I click sign in it auto signs back in without asking me credentials, not sure if this is by design. 

---

## 18. Performance / Quick Visual Check

| # | Verify |
|---|---|
| 18.1 | Initial load < 3s on local |
#gtg this is an extremly fast site
| 18.2 | Sidebar feels instant on click |
#gtg
| 18.3 | No flash of unstyled content (FOUC) |
#gtg
| 18.4 | No layout shift when sidebar collapse |
#gtg here but the only layout shift on the site is in the overlay area i spoke of earlier and anytime the scorekeepe/ref area says disconnecting or connected and disapears again. 
| 18.5 | DevTools → Network: no 500-class errors during normal browsing |
#gtg
| 18.6 | DevTools → Console: no red errors during normal browsing (yellow warnings are usually OK) |
#gtg

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
