alter table public.external_business_listings
  add column if not exists search_text text;

create or replace function public.external_business_listings_compute_search_text(
  name text,
  category text,
  city text,
  address_text text,
  postal_code text,
  province text,
  region text
) returns text
language sql
as $$
  select lower(concat_ws(' ', name, category, city, address_text, postal_code, province, region));
$$;

create or replace function public.external_business_listings_set_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := public.external_business_listings_compute_search_text(
    new.name,
    new.category,
    new.city,
    new.address_text,
    new.postal_code,
    new.province,
    new.region
  );
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'external_business_listings_search_text_trg'
  ) then
    create trigger external_business_listings_search_text_trg
    before insert or update of name, category, city, address_text, postal_code, province, region
    on public.external_business_listings
    for each row
    execute function public.external_business_listings_set_search_text();
  end if;
end $$;

update public.external_business_listings
set search_text = public.external_business_listings_compute_search_text(
  name,
  category,
  city,
  address_text,
  postal_code,
  province,
  region
)
where search_text is null;

create index if not exists external_business_listings_search_text_trgm_idx
  on public.external_business_listings using gin (search_text gin_trgm_ops)
  where country_code = 'IT' and listing_status in ('unverified', 'claimed');
