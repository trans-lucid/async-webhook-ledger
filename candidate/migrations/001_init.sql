create table if not exists webhook_events (
  provider_event_id text primary key,
  source text not null,
  event_type text not null,
  account_id text,
  object_id text,
  occurred_at timestamptz,
  status text not null,
  rejection_reason text,
  attempts integer not null default 0,
  side_effect_key text,
  payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists business_objects (
  account_id text not null,
  object_id text not null,
  state text not null,
  paid_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 0,
  last_event_id text,
  updated_at timestamptz not null default now(),
  primary key (account_id, object_id)
);

create table if not exists provider_side_effects (
  side_effect_key text primary key,
  provider_event_id text not null,
  account_id text not null,
  object_id text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
