alter table public.external_business_listings
  add column if not exists extras jsonb not null default '{}'::jsonb;

create index if not exists external_business_listings_extras_gin
  on public.external_business_listings using gin (extras);

