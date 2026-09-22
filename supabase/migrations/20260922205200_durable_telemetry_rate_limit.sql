create table if not exists public.telemetry_rate_limit_state (
  scope text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

alter table public.telemetry_rate_limit_state enable row level security;
revoke all on table public.telemetry_rate_limit_state from anon, authenticated;
grant all on table public.telemetry_rate_limit_state to service_role;

comment on table public.telemetry_rate_limit_state is
'Server-only bounded global telemetry rate state. Stores no client identifiers or PII.';

create or replace function public.claim_telemetry_slot(
  p_scope text,
  p_limit integer,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_bucket timestamptz := date_trunc('minute', p_now);
  v_allowed boolean := false;
begin
  if p_scope is null or btrim(p_scope) = '' then
    raise exception 'scope required';
  end if;
  if p_limit < 1 or p_limit > 10000 then
    raise exception 'limit out of bounds';
  end if;

  insert into public.telemetry_rate_limit_state(scope, window_started_at, request_count)
  values (p_scope, v_bucket, 1)
  on conflict (scope) do update
    set window_started_at = case
          when telemetry_rate_limit_state.window_started_at = v_bucket
            then telemetry_rate_limit_state.window_started_at
          else v_bucket
        end,
        request_count = case
          when telemetry_rate_limit_state.window_started_at = v_bucket
            then telemetry_rate_limit_state.request_count + 1
          else 1
        end
    where telemetry_rate_limit_state.window_started_at <> v_bucket
       or telemetry_rate_limit_state.request_count < p_limit
  returning true into v_allowed;

  return coalesce(v_allowed, false);
end;
$function$;

revoke all on function public.claim_telemetry_slot(text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_telemetry_slot(text, integer, timestamptz) to service_role;
