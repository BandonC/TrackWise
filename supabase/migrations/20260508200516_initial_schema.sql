-- Enable required extensions.
-- Declaring them here ensures the migration is self-contained even if they
-- are already enabled in the Supabase dashboard.
create extension if not exists vector;
create extension if not exists pg_net;

-- ============================================================
-- Tables
-- ============================================================

create table applications (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  company           text        not null,
  role              text        not null,
  location          text,
  salary_min        int,
  salary_max        int,
  source_url        text,
  source_site       text,
  status            text        not null default 'applied'
                                check (status in ('applied','screening','interview','offer','rejected')),
  applied_at        timestamptz not null default now(),
  last_updated_at   timestamptz not null default now(),
  notes             text,
  embedding         extensions.vector(512),
  embedding_source  text
);

create table application_events (
  id              uuid        primary key default gen_random_uuid(),
  application_id  uuid        not null references applications(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  event_type      text        not null
                              check (event_type in ('created','status_change','note_added')),
  from_status     text,
  to_status       text,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- Row-level security
-- ============================================================

alter table applications       enable row level security;
alter table application_events enable row level security;

create policy "users access own applications"
  on applications for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users access own events"
  on application_events for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- Indexes
-- ============================================================

create index applications_user_status_idx
  on applications (user_id, status);

create index applications_user_applied_at_idx
  on applications (user_id, applied_at desc);

-- IVFFlat index on embedding is intentionally omitted here.
-- It requires existing rows to build cluster centroids.
-- Add it in a separate migration after the first batch of data.

-- ============================================================
-- Trigger: log_application_created
-- Fires after every insert on applications.
-- Writes a 'created' event to application_events.
-- ============================================================

create or replace function log_application_created()
returns trigger
language plpgsql
security invoker
as $$
begin
  insert into application_events (application_id, user_id, event_type)
  values (new.id, new.user_id, 'created');
  return new;
end;
$$;

create trigger on_application_created
  after insert on applications
  for each row execute function log_application_created();

-- ============================================================
-- Trigger: log_status_change
-- Fires before every update on applications.
-- Logs a 'status_change' event when status transitions.
-- Always refreshes last_updated_at.
-- ============================================================

create or replace function log_status_change()
returns trigger
language plpgsql
security invoker
as $$
begin
  if old.status is distinct from new.status then
    insert into application_events
      (application_id, user_id, event_type, from_status, to_status)
    values
      (new.id, new.user_id, 'status_change', old.status, new.status);
  end if;
  new.last_updated_at := now();
  return new;
end;
$$;

create trigger on_status_change
  before update on applications
  for each row execute function log_status_change();
