# Loop State Log (persistent memory) — project: what-to-build

This file is THIS PROJECT's own memory, isolated from any other project
under output/. Claude (builder) and Antigravity (reviewer) both read it
for context and append their own notes before finishing.

## Task
See prompt.md for what's being built. This loop runs until Antigravity
approves the contents of output/what-to-build/ or the iteration cap is hit.

## Iteration history
(appended automatically as the loop runs)

## Iteration 1 - Claude (builder)

Built the full project from scratch (no prior iteration existed):

- Created `venv/` (Python 3.14) and installed Django 6.0.7; pinned versions
  in `requirements.txt` (Django, asgiref, sqlparse, tzdata).
- Scaffolded `loginapp` project + `accounts` app via standard
  `django-admin startproject` / `manage.py startapp`.
- SQLite only (default `DATABASES` config, untouched); ran `migrate` —
  applied cleanly with no errors.
- Added `accounts/management/commands/seed_demo_user.py` — a management
  command (not manual shell steps) that creates/updates exactly one demo
  user: `demo@example.com` / `  `. Ran it once so the checked-in
  `db.sqlite3` already has the demo user ready.
- `accounts/views.py`: `login_view` looks up `User` by `email__iexact`,
  authenticates with that user's username + submitted password, calls
  `django.contrib.auth.login()` on success, redirects to `dashboard`.
  Already-authenticated users hitting `/` are redirected straight to the
  dashboard. Any failure (unknown email or wrong password) falls through
  to one generic "Invalid email or password" message. `dashboard_view` is
  wrapped in `@login_required` (set `LOGIN_URL = 'login'` in settings so
  anonymous visits redirect back to the login page). `logout_view` calls
  `logout()` and redirects to `login`.
- Templates: `accounts/templates/accounts/base.html` (violet diagonal
  gradient, 4 blurred radial-gradient blobs, frosted-glass card with
  backdrop-filter blur + fallback -webkit prefix, responsive down to
  360px via `max-width` + fluid `width: 100%` on the card, no fixed
  overflow-causing widths), `login.html` (extends base, `{% csrf_token %}`
  present, email + password inputs with focus states, full-width violet
  gradient "Sign In" button with hover transition, red/pink translucent
  error banner shown inline when `error` context var is set), and
  `dashboard.html` (extends base, shows "Welcome, {email}" + "Log out"
  link).
- Wired `loginapp/urls.py` to `include('accounts.urls')`; `accounts/urls.py`
  maps `/` → login, `/dashboard/` → dashboard, `/logout/` → logout.
- `README.md` has the demo credentials at the very top, an explanation of
  the auth flow, and the exact copy-pasteable venv/install/migrate/seed/run
  command sequence.

Sanity-checked everything myself before finishing (ran the real dev
server on 127.0.0.1:8765 and drove it with curl, not just `manage.py
check`):
- `migrate` — applied all migrations cleanly, no errors.
- `runserver` — started with no errors/warnings.
- CSRF token confirmed present in the rendered login HTML.
- POST wrong password → 200 + "Invalid email or password" shown, not
  logged in.
- POST correct demo credentials → 302 to `/dashboard/`; dashboard shows
  "Welcome, demo@example.com".
- GET `/logout/` → 302 to `/`; subsequent GET `/dashboard/` while logged
  out → 302 to `/?next=/dashboard/` (login page), not the dashboard.
- Killed the test server afterward and removed the throwaway
  curl/cookie-jar files so they don't linger in the deliverable.

Not yet manually eyeballed in an actual browser at 360px/desktop — CSS
was hand-verified against the spec (gradient, blobs, glass card, focus
states, button hover, error banner, responsive max-width) but a visual
screenshot pass would be the natural next check if the reviewer flags
anything layout-related.

## Iteration 1 - Antigravity (reviewer)

Reviewed `output/what-to-build/` against all requirements specified in `prompt.md` and executed functional tests using Python and Django's test client:

1. **Environment & Setup**: Virtual environment exists (`venv`), `requirements.txt` correctly pins dependencies (`Django==6.0.7`, `asgiref==3.12.1`, `sqlparse==0.5.5`, `tzdata==2026.3`), and `README.md` documents copy-pasteable setup commands along with demo credentials at the top (`demo@example.com` / `DemoPass123!`).
2. **Project & Database Architecture**: `loginapp` Django project and `accounts` app follow standard Django conventions and use SQLite (`db.sqlite3`).
3. **Database Migrations & Seeding**: `python manage.py migrate` and `python manage.py seed_demo_user` run cleanly. The demo user is properly seeded in the SQLite database.
4. **Authentication & Session Behavior**:
   - Email-based lookup (`User.objects.get(email__iexact=email)`) authenticates and logs the user in on valid credentials via `django.contrib.auth.login()`.
   - Successful login redirects to `/dashboard/` displaying `"Welcome, demo@example.com"` and a working `"Log out"` link that ends the session.
   - Invalid credentials (unknown email or wrong password) return HTTP 200 with the single generic error message `"Invalid email or password"`.
   - CSRF protection is active with `{% csrf_token %}` present in the form and `CsrfViewMiddleware` enabled.
   - Authenticated users visiting `/` are redirected straight to `/dashboard/`.
   - Unauthenticated access to `/dashboard/` redirects to the login route (`/?next=/dashboard/`).
5. **Frontend / Glassmorphism Visual Style**:
   - Full-viewport diagonal linear gradient background in violet/purple shades.
   - 4 blurred radial-gradient background blobs for visual depth.
   - Frosted glass login card featuring `background: rgba(255, 255, 255, 0.12)`, `backdrop-filter: blur(18px)` (and `-webkit-backdrop-filter`), 1px translucent white border, 22px rounded corners, and soft outer box-shadow.
   - "Welcome Back" heading, short subtext, glass-styled email & password inputs with focus glow, full-width violet gradient button with hover transition, and translucent red error banner.
   - Responsive layout with `max-width: 380px` and fluid `width: 100%` suitable for both 360px mobile width and desktop viewports without horizontal overflow.

Verdict: All deliverables and requirements in `prompt.md` are met without defect.

APPROVED

