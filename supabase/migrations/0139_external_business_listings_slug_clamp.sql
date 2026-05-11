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
  v_max_base_len int;
begin
  if (new.slug is null or trim(new.slug) = '') then
    v_suffix := substr(new.id::text, 1, 8);
    v_base := public.normalize_slug(concat_ws(' ', new.name, nullif(trim(coalesce(new.city, '')), '')));
    v_max_base_len := 90 - length(v_suffix) - 1;
    if v_base is not null and length(v_base) > v_max_base_len then
      v_base := substr(v_base, 1, v_max_base_len);
      v_base := nullif(trim(both '-' from v_base), '');
    end if;
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

