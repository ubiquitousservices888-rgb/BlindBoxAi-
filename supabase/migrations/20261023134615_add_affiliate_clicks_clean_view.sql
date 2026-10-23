-- Applied to production as migration 20261023134615.
-- Preserves all original click data; default browser traffic is not proven human.
create or replace view public.affiliate_clicks_clean with (security_invoker = true) as
select c.*,
  case
    when c.client_class = 'human_candidate'
      and coalesce(c.quality_reason, 'default_candidate') = 'default_candidate'
    then 'unclassified'
    else c.client_class
  end as clean_class
from public.affiliate_clicks c;
