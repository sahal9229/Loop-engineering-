# Loginapp — Demo Login Credentials

```
Email:    demo@example.com
Password: DemoPass123!
```

The demo user already exists in the checked-in `db.sqlite3` (seeded via
`accounts/management/commands/seed_demo_user.py`). If you ever reset the
database, just re-run the migrate + seed commands below to get it back.

## What this is

A Django project with a single `accounts` app implementing email-based
login on top of Django's built-in `User` model and session auth, styled
as a glassmorphism card on a violet gradient background.

- `loginapp/` — Django project (settings, root urls, wsgi/asgi)
- `accounts/` — the app: login view, dashboard view, logout view,
  templates, and the `seed_demo_user` management command
- `db.sqlite3` — SQLite database, already migrated and seeded
- `requirements.txt` — pinned dependency versions (Django 6.0.7)

## Setup (copy-paste sequence)

From this directory (`output/what-to-build/`):

```bash
# 1. Create and activate a virtual environment
python -m venv venv
# macOS/Linux:
source venv/bin/activate
# Windows (PowerShell):
venv\Scripts\Activate.ps1
# Windows (cmd):
venv\Scripts\activate.bat

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run migrations (safe to re-run; already applied in the checked-in db)
python manage.py migrate

# 4. Seed the one demo user (safe to re-run; updates the password if it changed)
python manage.py seed_demo_user

# 5. Run the server
python manage.py runserver
```

Then open http://127.0.0.1:8000/ and sign in with the credentials above.

## How the auth works

- The login form (`accounts/templates/accounts/login.html`) posts `email`
  + `password` to `/` (the login view), with `{% csrf_token %}` included
  and CSRF middleware left enabled.
- `accounts/views.py::login_view` looks up `User.objects.get(email__iexact=email)`,
  then calls Django's `authenticate()` with that user's `username` and the
  submitted password, then `django.contrib.auth.login()` on success to
  start a real session.
- Unknown email or wrong password both fall through to the same generic
  `"Invalid email or password"` message — the form never reveals which
  field was wrong.
- An already-authenticated user hitting `/` is redirected straight to
  `/dashboard/`.
- `/dashboard/` is protected with Django's `@login_required` (redirects
  anonymous visitors back to the login page via `LOGIN_URL`), shows
  "Welcome, {email}", and has a "Log out" link that calls
  `django.contrib.auth.logout()` and redirects to `/`.

## Notes

- Uses SQLite only — no Postgres/MySQL/Docker/extra services required.
- `SECRET_KEY` in `loginapp/settings.py` is the Django dev default —
  fine for this demo, not for production use.
