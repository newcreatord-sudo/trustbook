alter table public.external_business_listings
  add column if not exists search_text text
  generated always as (
    lower(
      concat_ws(
        ' ',
        name,
        category,
        city,
        address_text,
        postal_code,
        province,
        region
      )
    )
  ) stored;

create index if not exists external_business_listings_search_text_trgm_idx
  on public.external_business_listings using gin (search_text gin_trgm_ops)
  where country_code = 'IT' and listing_status in ('unverified', 'claimed');
