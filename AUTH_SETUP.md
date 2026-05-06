# Authentication Setup

## Overview

The app has a full registration + auth system with two roles:
- **Players (default)** — view games, profiles, leaderboards. RSVP to future games.
- **Admins** — create games, edit/delete games, settle balances. Plus everything a player can do.

## One-Time Setup

### 1. Run the SQL migration

In your Supabase project:

1. Open **SQL Editor** → **New Query**.
2. Paste the contents of [`supabase/migrations/create_users_table.sql`](./supabase/migrations/create_users_table.sql).
3. Click **Run**.

This creates the `users` profile table and:
- A trigger on `auth.users` so a profile row is created automatically on signup (no orphan auth users).
- A unique index on `lower(player_name)` so player names are case-insensitive unique.
- A trigger that keeps `updated_at` fresh.
- RLS policies — anyone can read, only owners can insert/update, and a user **cannot** flip their own `is_admin` from the client.

The migration is idempotent — re-run it any time to update policies or triggers.

### 2. Promote yourself to admin

The first admin has to be set manually since the RLS policy blocks self-promotion:

```sql
UPDATE users SET is_admin = true WHERE email = 'you@example.com';
```

After that, you can promote anyone else the same way.

There is also a hard-coded fallback admin in [`src/lib/auth.ts`](src/lib/auth.ts) (`ADMIN_EMAIL`) that is treated as admin even without a `users.is_admin = true` row, so the project can't lock itself out. Edit that constant if you need to change it.

### 3. Email confirmation (Supabase setting)

By default Supabase **requires email confirmation** before login. Signup will show a "Check your email" view rather than logging the user in immediately. You can change this in Supabase **Authentication → Providers → Email** if you want auto-login.

## User Flows

### Signup ([`/signup`](src/app/signup/page.tsx))
1. User enters player name, email, password.
2. Client validates: name 2–24 chars, ASCII-ish only; password ≥ 8 chars with letter + number.
3. Client checks the name isn't already taken (the unique index is the real guarantee).
4. `supabase.auth.signUp` runs; the DB trigger creates the `users` row in the same transaction.
5. If email confirmation is required, user sees "Check your email"; otherwise they're logged in.

### Login ([`/login`](src/app/login/page.tsx))
- Friendly error mapping for common Supabase messages ("invalid credentials" → human text).
- "Forgot password?" link.
- Logged-in users are redirected to `/` instead of seeing the form.

### Forgot password ([`/forgot-password`](src/app/forgot-password/page.tsx) → [`/reset-password`](src/app/reset-password/page.tsx))
- Sends a Supabase recovery email with a redirect to `/reset-password`.
- The reset page listens for the `PASSWORD_RECOVERY` auth event and shows the new-password form.
- After updating, the user is signed out and redirected to `/login`.

### Account ([`/account`](src/app/account/page.tsx))
- Edit player name (name uniqueness pre-checked + DB-enforced).
- Change password (re-verifies current password before updating).
- Logout button.
- After saving, fires a `pt:profile-updated` window event so the NavBar refreshes the displayed name without a full reload.

## Permission Enforcement

There are **three layers** so admin-gated actions can't be bypassed:

| Layer | File | What it does |
|---|---|---|
| UI | [`src/app/games/page.tsx`](src/app/games/page.tsx) | Hides the "Start New Game" button for non-admins |
| Server route guard | [`src/app/games/create/layout.tsx`](src/app/games/create/layout.tsx) | Redirects non-admins who navigate directly to `/games/create` |
| RLS / DB | [`supabase/migrations/create_users_table.sql`](supabase/migrations/create_users_table.sql) | Server-side row policies on the `users` table; future game tables should use the same pattern |

History pages also check `isAdminDb` server-side and only render the Edit/Delete/Settle controls when the user is admin.

## Database Schema

```
users
├── user_id (UUID, PK, FK → auth.users)
├── email (TEXT, UNIQUE)
├── player_name (TEXT, 2–24 chars, case-insensitive UNIQUE)
├── is_admin (BOOLEAN, default false)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ, auto-updated)
```

## Future Enhancements
- RSVP system for upcoming games
- Per-user avatar upload from the account page
- Email notifications for game updates / settlement reminders
