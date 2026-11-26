-- Additive Pro-only schema. Existing affiliate, publishing and owner tables are untouched.
-- Apply only after disposable PostgreSQL tests and protected-path review.
begin;

create table public.pro_accounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  livemode boolean not null,
  stripe_customer_id text,
  risk_hold boolean not null default false,
  checkout_attempt_id uuid,
  checkout_attempt_created_at timestamptz,
  checkout_session_id text,
  checkout_expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, livemode),
  unique (stripe_customer_id, livemode),
  unique (checkout_session_id, livemode),
  check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9_]+$')
);

create table public.pro_subscriptions (
  subscription_id text not null,
  livemode boolean not null,
  user_id uuid not null,
  price_id text not null,
  status text not null,
  paid_through timestamptz,
  latest_invoice_id text,
  event_created bigint not null,
  last_event_id text not null,
  updated_at timestamptz not null default now(),
  primary key (subscription_id, livemode),
  foreign key (user_id, livemode) references public.pro_accounts(user_id, livemode) on delete cascade,
  check (subscription_id ~ '^sub_[A-Za-z0-9_]+$')
);
create index pro_subscriptions_owner on public.pro_subscriptions(user_id, livemode);

create table public.pro_stripe_events (
  event_id text not null,
  livemode boolean not null,
  event_type text not null,
  event_created bigint not null,
  outcome text not null,
  processed_at timestamptz not null default now(),
  primary key (event_id, livemode)
);

create function public.pro_valid_inputs(p_inputs jsonb) returns boolean
language plpgsql immutable security invoker set search_path = pg_catalog as $$
declare k text; n numeric;
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'object' then return false; end if;
  foreach k in array array['purchase','inboundShipping','salesTax','salePrice','feePercent','outboundShipping','desiredProfit'] loop
    if jsonb_typeof(p_inputs->k) is distinct from 'number' then return false; end if;
    n := (p_inputs->>k)::numeric;
    if n < 0 or n > 100000000 or (k = 'feePercent' and n >= 100) then return false; end if;
  end loop;
  return true;
end $$;

create table public.pro_scenarios (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  inputs jsonb not null check (public.pro_valid_inputs(inputs)),
  quantity integer not null check (quantity between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pro_scenarios_owner on public.pro_scenarios(user_id, created_at desc);

create table public.pro_rate_limits (
  bucket_key text primary key,
  started_at timestamptz not null,
  used integer not null
);

create function public.pro_schema_version() returns integer
language sql stable security invoker set search_path = pg_catalog as $$ select 1 $$;

create function public.pro_take_rate_limit(p_key text, p_limit integer, p_seconds integer) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare allowed boolean;
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 1000 or p_seconds not between 1 and 86400 then raise exception 'invalid_rate_limit'; end if;
  insert into public.pro_rate_limits(bucket_key, started_at, used) values (p_key, now(), 1)
  on conflict (bucket_key) do update set
    started_at = case when pro_rate_limits.started_at <= now() - make_interval(secs => p_seconds) then now() else pro_rate_limits.started_at end,
    used = case when pro_rate_limits.started_at <= now() - make_interval(secs => p_seconds) then 1 else least(pro_rate_limits.used + 1, p_limit + 1) end
  returning used <= p_limit into allowed;
  delete from public.pro_rate_limits where bucket_key in (
    select bucket_key from public.pro_rate_limits where started_at < now() - interval '2 days' limit 20
  );
  return allowed;
end $$;

create function public.pro_claim_checkout(p_user_id uuid, p_livemode boolean) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare a public.pro_accounts;
begin
  insert into public.pro_accounts(user_id, livemode) values (p_user_id, p_livemode) on conflict do nothing;
  select * into strict a from public.pro_accounts where user_id = p_user_id and livemode = p_livemode for update;
  if a.risk_hold or exists(select 1 from public.pro_subscriptions where user_id = p_user_id and livemode = p_livemode and status not in ('canceled','incomplete_expired')) then
    return jsonb_build_object('blocked', true);
  end if;
  if a.checkout_attempt_id is not null then
    if a.checkout_session_id is null then
      -- Preserve an ambiguous provider submission instead of making a new one.
      if a.checkout_attempt_created_at > now() - interval '29 minutes' then return to_jsonb(a); end if;
      return jsonb_build_object('blocked', true);
    end if;
    if a.checkout_expires_at > now() then return to_jsonb(a); end if;
  end if;
  update public.pro_accounts set checkout_attempt_id = gen_random_uuid(), checkout_attempt_created_at = now(), checkout_session_id = null, checkout_expires_at = null
  where user_id = p_user_id and livemode = p_livemode returning * into a;
  return to_jsonb(a);
end $$;

create function public.pro_bind_customer(p_user_id uuid, p_livemode boolean, p_customer_id text) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_customer_id !~ '^cus_[A-Za-z0-9_]+$' then raise exception 'invalid_customer'; end if;
  update public.pro_accounts set stripe_customer_id = p_customer_id
  where user_id = p_user_id and livemode = p_livemode and (stripe_customer_id is null or stripe_customer_id = p_customer_id);
  if not found then raise exception 'customer_conflict'; end if;
  return true;
end $$;

create function public.pro_save_checkout(p_user_id uuid, p_livemode boolean, p_attempt_id uuid, p_session_id text, p_expires_at timestamptz) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_session_id !~ '^cs_[A-Za-z0-9_]+$' or p_expires_at <= now() then raise exception 'invalid_checkout'; end if;
  update public.pro_accounts set checkout_session_id = p_session_id, checkout_expires_at = p_expires_at
  where user_id = p_user_id and livemode = p_livemode and checkout_attempt_id = p_attempt_id and not risk_hold
    and (checkout_session_id is null or checkout_session_id = p_session_id);
  if not found then raise exception 'checkout_conflict'; end if;
  return true;
end $$;

create function public.pro_apply_stripe_event(
  p_event_id text, p_event_type text, p_event_created bigint, p_livemode boolean,
  p_user_id uuid, p_customer_id text, p_subscription jsonb, p_risk_hold boolean, p_clear_checkout boolean
) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare inserted integer;
begin
  insert into public.pro_stripe_events(event_id,livemode,event_type,event_created,outcome)
  values(p_event_id,p_livemode,p_event_type,p_event_created,case when p_risk_hold then 'risk_hold' when p_subscription is not null then 'subscription_snapshot' else 'recorded' end)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return false; end if;
  perform 1 from public.pro_accounts where user_id = p_user_id and livemode = p_livemode and stripe_customer_id = p_customer_id for update;
  if not found then raise exception 'customer_conflict'; end if;
  if p_subscription is not null then
    if p_subscription->>'customer' is distinct from p_customer_id then raise exception 'subscription_conflict'; end if;
    insert into public.pro_subscriptions(subscription_id,livemode,user_id,price_id,status,paid_through,latest_invoice_id,event_created,last_event_id)
    values(p_subscription->>'id',p_livemode,p_user_id,p_subscription->>'price_id',p_subscription->>'status',
      (p_subscription->>'paid_through')::timestamptz,p_subscription->>'latest_invoice_id',p_event_created,p_event_id)
    on conflict(subscription_id,livemode) do update set status=excluded.status, paid_through=excluded.paid_through,
      latest_invoice_id=excluded.latest_invoice_id,event_created=excluded.event_created,last_event_id=excluded.last_event_id,updated_at=now()
    where pro_subscriptions.user_id = excluded.user_id and pro_subscriptions.price_id = excluded.price_id and pro_subscriptions.event_created <= excluded.event_created;
  end if;
  update public.pro_accounts set risk_hold = risk_hold or p_risk_hold,
    checkout_session_id = case when p_clear_checkout then null else checkout_session_id end,
    checkout_attempt_id = case when p_clear_checkout then null else checkout_attempt_id end,
    checkout_attempt_created_at = case when p_clear_checkout then null else checkout_attempt_created_at end,
    checkout_expires_at = case when p_clear_checkout then null else checkout_expires_at end
  where user_id = p_user_id and livemode = p_livemode;
  return true;
end $$;

create function public.pro_save_scenario(p_user_id uuid, p_id uuid, p_name text, p_inputs jsonb, p_quantity integer) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare result public.pro_scenarios;
begin
  perform 1 from public.pro_accounts where user_id = p_user_id order by livemode for update;
  if not found then raise exception 'account_required'; end if;
  if exists(select 1 from public.pro_scenarios where id = p_id and user_id <> p_user_id) then raise exception 'scenario_conflict'; end if;
  if not exists(select 1 from public.pro_scenarios where id = p_id) and (select count(*) from public.pro_scenarios where user_id = p_user_id) >= 250 then raise exception 'scenario_limit'; end if;
  insert into public.pro_scenarios(id,user_id,name,inputs,quantity) values(p_id,p_user_id,p_name,p_inputs,p_quantity)
  on conflict(id) do update set name=excluded.name,inputs=excluded.inputs,quantity=excluded.quantity,updated_at=now()
  where pro_scenarios.user_id = excluded.user_id returning * into result;
  if result.id is null then raise exception 'scenario_conflict'; end if;
  return to_jsonb(result);
end $$;

alter table public.pro_accounts enable row level security;
alter table public.pro_subscriptions enable row level security;
alter table public.pro_stripe_events enable row level security;
alter table public.pro_scenarios enable row level security;
alter table public.pro_rate_limits enable row level security;
revoke all on public.pro_accounts,public.pro_subscriptions,public.pro_stripe_events,public.pro_scenarios,public.pro_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on public.pro_accounts,public.pro_subscriptions,public.pro_stripe_events,public.pro_scenarios,public.pro_rate_limits to service_role;

revoke all on function public.pro_valid_inputs(jsonb),public.pro_schema_version(),public.pro_take_rate_limit(text,integer,integer),
  public.pro_claim_checkout(uuid,boolean),public.pro_bind_customer(uuid,boolean,text),public.pro_save_checkout(uuid,boolean,uuid,text,timestamptz),
  public.pro_apply_stripe_event(text,text,bigint,boolean,uuid,text,jsonb,boolean,boolean),public.pro_save_scenario(uuid,uuid,text,jsonb,integer)
  from public,anon,authenticated;
grant execute on function public.pro_valid_inputs(jsonb),public.pro_schema_version(),public.pro_take_rate_limit(text,integer,integer),
  public.pro_claim_checkout(uuid,boolean),public.pro_bind_customer(uuid,boolean,text),public.pro_save_checkout(uuid,boolean,uuid,text,timestamptz),
  public.pro_apply_stripe_event(text,text,bigint,boolean,uuid,text,jsonb,boolean,boolean),public.pro_save_scenario(uuid,uuid,text,jsonb,integer)
  to service_role;
commit;
