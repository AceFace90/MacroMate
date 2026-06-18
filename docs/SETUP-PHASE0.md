# MacroMate v2 — Phase 0 Setup Checklist

Phase 0 goal: **sign in with Google → write a `profiles` row → confirm RLS
isolates users.** This is the de-risking spike, not a feature.

The app code is scaffolded. These are the dashboard/config steps only **you** can
do (they're behind your Supabase + Google logins).

---

## 1. Create the `profiles` table + RLS (Supabase → SQL Editor)

Paste and run this in the Supabase SQL Editor:

```sql
-- Profile row per auth user. id == auth.users.id (the UUID).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  -- (Phase 2+ will add: dob, gender, height_cm, targets, country, units…)
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- RLS: this replaces v1's Express auth middleware entirely.
alter table public.profiles enable row level security;

-- A user can only see/modify their OWN row.
create policy "own profile" on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);
```

> If you enabled "automatic RLS on new tables", the `alter table … enable` line
> is redundant but harmless.

### (Optional) auto-create a profile row on signup
```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 2. Enable Google OAuth

### 2a. Google Cloud Console
1. Create / pick a project → **APIs & Services → Credentials**.
2. **Create Credentials → OAuth client ID → Web application**.
3. Under **Authorized redirect URIs**, add:
   ```
   https://vzcmeubfdjdwqhxihusw.supabase.co/auth/v1/callback
   ```
4. Copy the **Client ID** and **Client Secret**.

### 2b. Supabase
1. **Authentication → Providers → Google → enable**.
2. Paste the Client ID + Client Secret. Save.

### 2c. Redirect URLs (Supabase → Authentication → URL Configuration)
Add the URLs the app redirects back to after login:
- Web dev: `http://localhost:8082`
- Native: `macromate://auth-callback` (the app scheme from `app.json`)

---

## 3. Run the app

```bash
cd /Users/wcorrey/Claude/personal/MacroMate
npm install
npm run web        # opens http://localhost:8082
```

**Phase 0 exit gate:**
1. Click **Sign in with Google** → Google flow → back into the app.
2. On the Spike screen, enter a name → **Save profile row** → ✅.
3. **Read my profile row** → ✅ shows your row.
4. (RLS proof) In Supabase SQL Editor, confirm the row exists with your `auth.uid()`.
   A second user signing in cannot read/write it.

---

## 4. Account linking (future reference)
When email/magic-link is added later, turn on **"Link identities with the same
email"** in Supabase Auth so a user who used both Google and magic-link with the
same address stays one account. See `../../MacroMate-v1/docs/DATA-SYNC.md` §4.5b.

> ⚠️ Never put the `sb_secret_*` key in the app. Only the `sb_publishable_*` key
> belongs client-side (it's in `app.json → expo.extra`).
