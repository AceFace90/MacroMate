-- MacroMate v2 — Phase 2 migrations
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Extend profiles with biometric + target fields
alter table public.profiles
  add column if not exists weight_kg numeric(5,1),
  add column if not exists height_cm numeric(5,1),
  add column if not exists dob date,
  add column if not exists gender text check (gender in ('MALE','FEMALE','OTHER')),
  add column if not exists activity_level text check (activity_level in ('SEDENTARY','LIGHT','MODERATE','VERY','EXTRA')) default 'MODERATE',
  add column if not exists country text default 'AU';

-- 2. food_logs table
create table if not exists public.food_logs (
  id text primary key,                             -- client-generated uuid
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_date date not null,                       -- YYYY-MM-DD, indexed for date queries
  name text not null,
  calories integer,
  protein_g numeric(6,1),
  carbs_g numeric(6,1),
  fat_g numeric(6,1),
  quantity_g numeric(8,1),
  source text,
  logged_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists food_logs_user_date on public.food_logs (user_id, logged_date desc);

alter table public.food_logs enable row level security;

create policy "own logs" on public.food_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
