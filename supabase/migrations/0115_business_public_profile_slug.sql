-- Business public profile slug + optional profile settings for what to expose.

alter table public.businesses
  add column if not exists slug text,
  add column if not exists public_profile_settings jsonb not null default '{}'::jsonb;

create or replace function public.normalize_slug(p_raw text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from regexp_replace(lower(coalesce(p_raw, '')), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;

create or replace function public.ensure_business_slug()
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
    v_base := public.normalize_slug(new.name);
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

  return new;
end;
$$;

drop trigger if exists businesses_ensure_slug on public.businesses;
create trigger businesses_ensure_slug
before insert or update of slug, name on public.businesses
for each row execute function public.ensure_business_slug();

create unique index if not exists businesses_slug_unique
  on public.businesses (slug);

update public.businesses
set slug = public.normalize_slug(name) || '-' || substr(id::text, 1, 8)
where slug is null or trim(slug) = '';

