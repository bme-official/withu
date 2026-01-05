-- withu voice widget schema (Supabase/Postgres)
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
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

create index if not exists idx_sessions_site_id_created_at on sessions(site_id, created_at desc);
create index if not exists idx_messages_session_created_at on messages(session_id, created_at desc);
create index if not exists idx_events_session_created_at on events(session_id, created_at desc);
create index if not exists idx_events_type_created_at on events(type, created_at desc);


