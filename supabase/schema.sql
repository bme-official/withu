-- withu voice widget schema (Supabase/Postgres)
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  user_id uuid,
  user_agent text,
  ip text,
  -- hashed secret session token (prevents other users from calling APIs with a guessed/leaked sessionId)
  token_hash text,
  created_at timestamptz not null default now()
);

-- Anonymous users per site (for isolating chats + intimacy progression)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  intimacy_level int not null default 1 check (intimacy_level between 1 and 5),
  intimacy_xp int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_users_site_id_updated_at on users(site_id, updated_at desc);
create index if not exists idx_users_site_id_level on users(site_id, intimacy_level desc);

-- Per-site persona / UI config (edit in Supabase UI; fetched by /api/config)
create table if not exists site_profiles (
  site_id text primary key,
  display_name text not null default 'Mirai Aizawa',
  avatar_url text,
  -- used on server-side as additional system prompt (never sent as-is to clients)
  persona_prompt text not null default '',
  -- optional hint for Web Speech voice selection (client-side)
  tts_voice_hint text,
  -- JSON configs (editable via admin UI). Keep defaults empty objects.
  greeting_templates jsonb not null default '{}'::jsonb,
  cta_config jsonb not null default '{}'::jsonb,
  chat_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  type text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Add FK if missing (Supabase doesn't support IF NOT EXISTS for constraints directly)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_user_id_fkey'
  ) then
    alter table sessions
      add constraint sessions_user_id_fkey
      foreign key (user_id) references users(id) on delete set null;
  end if;
end $$;

-- Backfill / migrate for existing projects (safe to re-run)
alter table if exists sessions add column if not exists token_hash text;
alter table if exists sessions add column if not exists user_id uuid;
alter table if exists sessions add column if not exists site_id text;
alter table if exists sessions add column if not exists user_agent text;
alter table if exists sessions add column if not exists ip text;
alter table if exists sessions add column if not exists created_at timestamptz;

-- Backfill / migrate for site_profiles (safe to re-run)
alter table if exists site_profiles add column if not exists greeting_templates jsonb;
alter table if exists site_profiles add column if not exists cta_config jsonb;
alter table if exists site_profiles add column if not exists chat_config jsonb;

-- Indexes (run AFTER migrations)
create index if not exists idx_sessions_site_id_created_at on sessions(site_id, created_at desc);
create index if not exists idx_sessions_user_id_created_at on sessions(user_id, created_at desc);
create index if not exists idx_sessions_token_hash_created_at on sessions(token_hash, created_at desc);
create index if not exists idx_site_profiles_updated_at on site_profiles(updated_at desc);
create index if not exists idx_messages_session_created_at on messages(session_id, created_at desc);
create index if not exists idx_events_session_created_at on events(session_id, created_at desc);
create index if not exists idx_events_type_created_at on events(type, created_at desc);


