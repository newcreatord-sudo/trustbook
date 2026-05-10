create or replace view public.external_business_listings_public
with (security_barrier = true)
as
select
  id,
  slug,
  name,
  category,
  description,
  address_text,
  postal_code,
  city,
  province,
  region,
  country_code,
  lat,
  lng,
  case
    when data_checked_at is not null
      and data_checked_at >= now() - interval '180 days'
      and nullif(trim(coalesce(source_license, '')), '') is not null
    then phone
    else null
  end as phone,
  case
    when data_checked_at is not null
      and data_checked_at >= now() - interval '180 days'
      and nullif(trim(coalesce(source_license, '')), '') is not null
    then email
    else null
  end as email,
  case
    when data_checked_at is not null
      and data_checked_at >= now() - interval '180 days'
      and nullif(trim(coalesce(source_license, '')), '') is not null
    then website
    else null
  end as website,
  listing_status,
  source,
  source_ref,
  source_url,
  source_license,
  source_attribution,
  data_checked_at,
  imported_at,
  updated_at,
  claimed_business_id,
  claimed_at,
  claimed_by_user_id
from public.external_business_listings
where listing_status in ('unverified', 'claimed') and country_code = 'IT';

