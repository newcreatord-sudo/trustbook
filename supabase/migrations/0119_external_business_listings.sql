create table if not exists public.external_business_listings (
  id uuid primary key default gen_random_uuid(),
  slug text,
  name text not null,
  category text not null default 'altro',
  description text,
  address_text text,
  postal_code text,
  city text,
  province text,
  region text,
  country_code text not null default 'IT',
  lat double precision,
  lng double precision,
  phone text,
  email text,
  website text,
  listing_status text not null default 'unverified',
  source text not null,
  source_ref text,
  source_url text,
  source_license text,
  source_attribution text,
  data_checked_at timestamptz,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_business_id uuid references public.businesses(id) on delete set null,
  claimed_at timestamptz,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  constraint external_business_listings_status_check check (listing_status in ('unverified', 'claimed', 'archived', 'blocked'))
);

create unique index if not exists external_business_listings_source_ref_unique
  on public.external_business_listings (source, source_ref)
  where source_ref is not null and trim(source_ref) <> '';

create or replace function public.ensure_external_business_listing_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  v_suffix text;
begin
  if (new.slug is null or trim(new.slug) = '') then
    v_base := public.normalize_slug(concat_ws(' ', new.name, nullif(trim(coalesce(new.city, '')), '')));
    v_suffix := substr(new.id::text, 1, 8);
    v_slug := case when v_base is null then v_suffix else (v_base || '-' || v_suffix) end;
    new.slug := v_slug;
  else
    new.slug := public.normalize_slug(new.slug);
    if new.slug is null then
      raise exception 'invalid_slug';
    end if;
  end if;

  if length(new.slug) < 3 or length(new.slug) > 90 then
    raise exception 'invalid_slug_length';
  end if;
  if new.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_slug_format';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists external_business_listings_ensure_slug on public.external_business_listings;
create trigger external_business_listings_ensure_slug
before insert or update of slug, name, city on public.external_business_listings
for each row execute function public.ensure_external_business_listing_slug();

create unique index if not exists external_business_listings_slug_unique
  on public.external_business_listings (slug);

alter table public.external_business_listings enable row level security;

drop policy if exists external_business_listings_select_public on public.external_business_listings;
create policy external_business_listings_select_public on public.external_business_listings
for select to anon
using (listing_status <> 'blocked' and country_code = 'IT');

drop policy if exists external_business_listings_select_authed on public.external_business_listings;
create policy external_business_listings_select_authed on public.external_business_listings
for select to authenticated
using (listing_status <> 'blocked' and country_code = 'IT');
