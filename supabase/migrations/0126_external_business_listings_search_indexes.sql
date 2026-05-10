create extension if not exists pg_trgm;

create index if not exists external_business_listings_imported_at_idx
  on public.external_business_listings (imported_at desc)
  where country_code = 'IT' and listing_status in ('unverified', 'claimed');

create index if not exists external_business_listings_category_imported_at_idx
  on public.external_business_listings (category, imported_at desc)
  where country_code = 'IT' and listing_status in ('unverified', 'claimed');

create index if not exists external_business_listings_name_trgm_idx
  on public.external_business_listings using gin (name gin_trgm_ops)
  where country_code = 'IT' and listing_status in ('unverified', 'claimed');

create index if not exists external_business_listings_city_trgm_idx
  on public.external_business_listings using gin (city gin_trgm_ops)
  where country_code = 'IT' and listing_status in ('unverified', 'claimed');

create index if not exists external_business_listings_address_trgm_idx
  on public.external_business_listings using gin (address_text gin_trgm_ops)
  where country_code = 'IT' and listing_status in ('unverified', 'claimed');
