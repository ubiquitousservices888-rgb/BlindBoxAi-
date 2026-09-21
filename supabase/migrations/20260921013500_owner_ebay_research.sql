create table if not exists public.owner_integrations (
  provider text primary key,
  encrypted_refresh_token text not null,
  token_iv text not null,
  token_tag text not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.owner_integrations enable row level security;

revoke all on table public.owner_integrations from anon, authenticated;
grant all on table public.owner_integrations to service_role;

comment on table public.owner_integrations is
'Server-only owner integrations. No client access; eBay refresh token is encrypted before storage.';
