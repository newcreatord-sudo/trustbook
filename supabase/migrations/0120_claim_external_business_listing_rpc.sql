create or replace function public.claim_external_business_listing(
  p_listing_id uuid,
  p_overrides jsonb default '{}'::jsonb
)
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  u_role user_role;
  l public.external_business_listings;
  input jsonb;
  b public.businesses;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select p.role into u_role
  from public.profiles p
  where p.id = uid;
  if u_role is distinct from 'attivita' then
    raise exception 'role_not_allowed';
  end if;

  select *
  into l
  from public.external_business_listings
  where id = p_listing_id
  for update;

  if l.id is null then
    raise exception 'listing_not_found';
  end if;
  if l.listing_status = 'blocked' then
    raise exception 'listing_blocked';
  end if;
  if l.claimed_business_id is not null then
    raise exception 'listing_already_claimed';
  end if;

  if l.lat is null or l.lng is null then
    raise exception 'missing_coordinates';
  end if;

  input := jsonb_build_object(
    'name', l.name,
    'category', coalesce(nullif(trim(l.category), ''), 'altro'),
    'description', l.description,
    'addressText', l.address_text,
    'postalCode', l.postal_code,
    'city', l.city,
    'phone', l.phone,
    'email', l.email,
    'website', l.website,
    'lat', l.lat,
    'lng', l.lng,
    'isPaused', true
  ) || coalesce(p_overrides, '{}'::jsonb);

  b := public.create_business_with_defaults(input);

  update public.external_business_listings
  set
    listing_status = 'claimed',
    claimed_business_id = b.id,
    claimed_by_user_id = uid,
    claimed_at = now(),
    updated_at = now()
  where id = l.id;

  return b;
end;
$$;

grant execute on function public.claim_external_business_listing(uuid, jsonb) to authenticated;
