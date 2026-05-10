update public.external_business_listings
set source_ref = id::text
where source_ref is null or trim(source_ref) = '';

alter table public.external_business_listings
  alter column source_ref set not null;

alter table public.external_business_listings
  drop constraint if exists external_business_listings_source_ref_nonempty_check;

alter table public.external_business_listings
  add constraint external_business_listings_source_ref_nonempty_check check (trim(source_ref) <> '');

drop index if exists public.external_business_listings_source_ref_unique;

create unique index if not exists external_business_listings_source_ref_unique
  on public.external_business_listings (source, source_ref);

