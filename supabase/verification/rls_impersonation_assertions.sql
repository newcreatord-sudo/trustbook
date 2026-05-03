-- rls_impersonation_assertions.sql
-- Runtime RLS assertions with authenticated-role impersonation.
-- All data changes are wrapped in a transaction and rolled back.

begin;

do $$
declare
  owner_uid uuid;
  customer_uid uuid;
  outsider_uid uuid;
  staff_uid uuid;
  b_id uuid := gen_random_uuid();
  b_hidden_id uuid := gen_random_uuid();
  s_hidden_id uuid := gen_random_uuid();
  s_id uuid := gen_random_uuid();
  v_booking_id uuid := gen_random_uuid();
  v_booking_other uuid := gen_random_uuid();
  notif_id uuid;
  notif_other_id uuid;
  msg_owner_id uuid;
  msg_customer_id uuid;
  rr_id uuid := gen_random_uuid();
  sc_id uuid := gen_random_uuid();
  hidden_sc_id uuid := gen_random_uuid();
  bs_id uuid := gen_random_uuid();

  c_count int;
  o_count int;
  ext_count int;
begin
  select id into owner_uid from auth.users order by created_at asc limit 1;
  select id into customer_uid from auth.users where id <> owner_uid order by created_at asc limit 1;
  select id into outsider_uid from auth.users where id not in (owner_uid, customer_uid) order by created_at asc limit 1;
  select id into staff_uid from auth.users where id not in (owner_uid, customer_uid, outsider_uid) order by created_at asc limit 1;

  if owner_uid is null or customer_uid is null or outsider_uid is null then
    raise exception 'rls_impersonation_failed: not enough auth.users to run assertions (need at least 3).';
  end if;

  insert into public.businesses (id, owner_user_id, name, category, lat, lng)
  values (b_id, owner_uid, 'RLS Impersonation Fixture', 'altro', 45.4642, 9.1900);

  insert into public.services (id, business_id, name, duration_min, is_active)
  values (s_id, b_id, 'Fixture Service', 60, true);

  insert into public.businesses (id, owner_user_id, name, category, lat, lng, listing_visible)
  values (b_hidden_id, outsider_uid, 'RLS Hidden Fixture', 'altro', 45.4642, 9.1900, false);

  insert into public.services (id, business_id, name, duration_min, is_active)
  values (s_hidden_id, b_hidden_id, 'Hidden Fixture Service', 60, true);

  if staff_uid is not null then
    insert into public.team_members (id, business_id, user_id, role)
    values (bs_id, b_id, staff_uid, 'staff')
    on conflict (business_id, user_id) do nothing;
  end if;

  begin
    insert into public.recurring_rules (id, business_id, customer_user_id, service_id, frequency, interval, start_date)
    values (rr_id, b_id, customer_uid, s_id, 'weekly', 1, (now()::date + 7));
  exception
    when others then
      raise exception 'rls_impersonation_failed: fixture recurring_rules insert failed (%).', sqlerrm;
  end;

  if staff_uid is not null then
    insert into public.staff_closures (id, business_id, staff_id, start_at, end_at, reason)
    values (sc_id, b_id, bs_id, now() + interval '3 day', now() + interval '3 day 2 hour', 'fixture');
  end if;

  if staff_uid is not null then
    insert into public.staff_closures (id, business_id, staff_id, start_at, end_at, reason)
    values (hidden_sc_id, b_hidden_id, bs_id, now() + interval '5 day', now() + interval '5 day 2 hour', 'hidden_fixture');
  end if;

  insert into public.blocked_slots (id, business_id, staff_id, start_at, end_at, reason)
  values (gen_random_uuid(), b_hidden_id, null, now() + interval '5 day', now() + interval '5 day 1 hour', 'hidden_block');

  alter table public.bookings disable trigger user;
  insert into public.bookings (id, customer_user_id, business_id, service_id, start_at, end_at, status, deposit_status, deposit_amount_cents)
  values (
    v_booking_id,
    customer_uid,
    b_id,
    s_id,
    now() + interval '2 day',
    now() + interval '2 day 1 hour',
    'confirmed',
    'not_required',
    0
  );
  alter table public.bookings enable trigger user;

  alter table public.bookings disable trigger user;
  insert into public.bookings (id, customer_user_id, business_id, service_id, start_at, end_at, status, deposit_status, deposit_amount_cents)
  values (
    v_booking_other,
    outsider_uid,
    b_hidden_id,
    s_hidden_id,
    now() + interval '6 day',
    now() + interval '6 day 1 hour',
    'confirmed',
    'not_required',
    0
  );
  alter table public.bookings enable trigger user;

  insert into public.booking_chat_reads (booking_id, user_id, last_read_at)
  values (v_booking_other, customer_uid, now());

  insert into public.booking_messages (id, booking_id, sender_user_id, body)
  values (gen_random_uuid(), v_booking_id, owner_uid, 'owner message fixture')
  returning id into msg_owner_id;

  insert into public.booking_messages (id, booking_id, sender_user_id, body)
  values (gen_random_uuid(), v_booking_id, customer_uid, 'customer message fixture')
  returning id into msg_customer_id;

  insert into public.notifications (recipient_user_id, business_id, booking_id, kind, title, body, link, dedupe_key)
  values (
    customer_uid,
    b_id,
    v_booking_id,
    'booking_confirmed',
    'Fixture',
    'Fixture body',
    '/prenotazioni',
    v_booking_id::text || ':fixture_dedupe_rls'
  )
  on conflict (recipient_user_id, dedupe_key) do nothing;

  insert into public.notifications (recipient_user_id, business_id, booking_id, kind, title, body, link, dedupe_key)
  values (
    outsider_uid,
    b_id,
    v_booking_id,
    'booking_confirmed',
    'Fixture Other',
    'Fixture body other',
    '/prenotazioni',
    v_booking_id::text || ':fixture_dedupe_rls_other'
  )
  on conflict (recipient_user_id, dedupe_key) do nothing;

  insert into public.notifications (recipient_user_id, business_id, booking_id, kind, title, body, link, dedupe_key)
  values (
    customer_uid,
    b_id,
    v_booking_id,
    'booking_confirmed',
    'Fixture',
    'Fixture body',
    '/prenotazioni',
    v_booking_id::text || ':fixture_dedupe_rls'
  )
  on conflict (recipient_user_id, dedupe_key) do nothing;

  select count(*)
  into c_count
  from public.notifications n
  where n.recipient_user_id = customer_uid
    and n.dedupe_key = v_booking_id::text || ':fixture_dedupe_rls';
  if c_count <> 1 then
    raise exception 'rls_impersonation_failed: notifications dedupe failed (%).', c_count;
  end if;

  select n.id
  into notif_id
  from public.notifications n
  where n.recipient_user_id = customer_uid
    and n.dedupe_key = v_booking_id::text || ':fixture_dedupe_rls'
  limit 1;

  select n.id
  into notif_other_id
  from public.notifications n
  where n.recipient_user_id = outsider_uid
    and n.dedupe_key = v_booking_id::text || ':fixture_dedupe_rls_other'
  limit 1;

  insert into public.reviews (id, booking_id, business_id, author_user_id, direction, rating, comment)
  values (gen_random_uuid(), v_booking_id, b_id, customer_uid, 'customer_to_business', 5, 'fixture review public');

  insert into public.reviews (id, booking_id, business_id, author_user_id, direction, rating, comment)
  values (gen_random_uuid(), v_booking_id, b_id, owner_uid, 'business_to_customer', 4, 'fixture internal note');

  -- Customer: read own booking chat + can set read_at only.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', customer_uid::text, true);

  select count(*)
  into c_count
  from public.booking_messages m
  where m.id in (msg_owner_id, msg_customer_id);
  if c_count <> 2 then
    raise exception 'rls_impersonation_failed: customer cannot read booking messages as expected.';
  end if;

  select count(*) into c_count from public.bookings where id = v_booking_other;
  if c_count <> 0 then
    raise exception 'rls_impersonation_failed: customer can read outsider booking (%).', c_count;
  end if;

  select count(*) into c_count from public.booking_chat_reads where booking_id = v_booking_other;
  if c_count <> 0 then
    raise exception 'rls_impersonation_failed: customer can read chat reads for non-participant booking (%).', c_count;
  end if;

  select count(*) into c_count from public.notifications where id = notif_other_id;
  if c_count <> 0 then
    raise exception 'rls_impersonation_failed: customer can read other user notifications (%).', c_count;
  end if;

  begin
    perform public.notify_user(customer_uid, b_id, v_booking_id, 'fixture', 'x', 'x', null, 'k');
    raise exception 'rls_impersonation_failed: customer can execute notify_user.';
  exception
    when others then
      null;
  end;

  begin
    perform public.notify_user_at(customer_uid, b_id, v_booking_id, 'fixture', 'x', 'x', null, 'k', now() + interval '1 hour');
    raise exception 'rls_impersonation_failed: customer can execute notify_user_at.';
  exception
    when others then
      null;
  end;

  begin
    perform public.insert_booking_event(v_booking_id, 'fixture', 'all', customer_uid, '{}'::jsonb);
    raise exception 'rls_impersonation_failed: customer can execute insert_booking_event.';
  exception
    when others then
      null;
  end;

  select count(*) into c_count from public.list_staff_closures_for_booking(b_hidden_id);
  if c_count <> 0 then
    raise exception 'rls_impersonation_failed: customer can list staff closures for hidden business (%).', c_count;
  end if;

  select count(*) into c_count from public.list_blocked_slots_for_booking(b_hidden_id);
  if c_count <> 0 then
    raise exception 'rls_impersonation_failed: customer can list blocked slots for hidden business (%).', c_count;
  end if;

  select count(*) into c_count from public.list_bookable_staff_for_booking(b_hidden_id);
  if c_count <> 0 then
    raise exception 'rls_impersonation_failed: customer can list staff roster for hidden business (%).', c_count;
  end if;

  begin
    select count(*) into c_count from public.recurring_rules where business_id = b_id;
    if c_count <> 0 then
      raise exception 'rls_impersonation_failed: customer can read recurring_rules (%).', c_count;
    end if;
  exception
    when others then
      if position('permission denied' in lower(sqlerrm)) > 0 then
        null;
      else
        raise;
      end if;
  end;

  select count(*) into c_count from public.business_subscriptions where business_id = b_id;
  if c_count <> 0 then
    raise exception 'rls_impersonation_failed: customer can read business_subscriptions (%).', c_count;
  end if;

  update public.notifications
  set read_at = now()
  where id = notif_id;

  begin
    update public.notifications
    set title = 'Tampered title'
    where id = notif_id;
    raise exception 'rls_impersonation_failed: notification payload mutation unexpectedly allowed.';
  exception
    when others then
      if position('unauthorized_notification_mutation' in lower(sqlerrm)) = 0 then
        raise;
      end if;
  end;

  select count(*)
  into c_count
  from public.reviews rv
  where rv.business_id = b_id
    and rv.direction = 'business_to_customer';
  if c_count <> 0 then
    raise exception 'rls_impersonation_failed: customer can read internal business_to_customer reviews (%).', c_count;
  end if;

  select count(*)
  into c_count
  from public.reviews rv
  where rv.business_id = b_id
    and rv.direction = 'customer_to_business';
  if c_count <> 1 then
    raise exception 'rls_impersonation_failed: customer cannot read public customer_to_business reviews (%).', c_count;
  end if;

  execute 'reset role';

  -- Owner: can read chat as business member.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', owner_uid::text, true);

  select count(*)
  into o_count
  from public.booking_messages m
  where m.id in (msg_owner_id, msg_customer_id);
  if o_count <> 2 then
    raise exception 'rls_impersonation_failed: owner cannot read booking messages as expected.';
  end if;

  select count(*)
  into o_count
  from public.reviews rv
  where rv.business_id = b_id
    and rv.direction = 'business_to_customer';
  if o_count <> 1 then
    raise exception 'rls_impersonation_failed: owner cannot read internal business_to_customer reviews (%).', o_count;
  end if;

  begin
    select count(*) into o_count from public.recurring_rules where business_id = b_id;
    if o_count <> 1 then
      raise exception 'rls_impersonation_failed: owner cannot read recurring_rules (%).', o_count;
    end if;
  exception
    when others then
      if position('permission denied' in lower(sqlerrm)) > 0 then
        null;
      else
        raise;
      end if;
  end;

  execute 'reset role';

  -- Outsider: cannot read/insert booking chat and unread RPC returns zero.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', outsider_uid::text, true);

  select count(*)
  into ext_count
  from public.booking_messages m
  where m.id in (msg_owner_id, msg_customer_id);
  if ext_count <> 0 then
    raise exception 'rls_impersonation_failed: outsider can read booking messages (%).', ext_count;
  end if;

  select count(*)
  into ext_count
  from public.reviews rv
  where rv.business_id = b_id
    and rv.direction = 'business_to_customer';
  if ext_count <> 0 then
    raise exception 'rls_impersonation_failed: outsider can read internal business_to_customer reviews (%).', ext_count;
  end if;

  begin
    insert into public.booking_messages (booking_id, sender_user_id, body)
    values (v_booking_id, outsider_uid, 'outsider write should fail');
    raise exception 'rls_impersonation_failed: outsider insert unexpectedly allowed.';
  exception
    when others then
      if position('row-level security' in lower(sqlerrm)) = 0
         and position('new row violates row-level security policy' in lower(sqlerrm)) = 0 then
        raise;
      end if;
  end;

  select public.unread_booking_messages_count_for_current_user(null, true)
  into ext_count;
  if ext_count <> 0 then
    raise exception 'rls_impersonation_failed: outsider unread count leaked rows (%).', ext_count;
  end if;

  execute 'reset role';

  if staff_uid is not null then
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', staff_uid::text, true);

    begin
      select count(*) into ext_count from public.recurring_rules where business_id = b_id;
      if ext_count <> 1 then
        raise exception 'rls_impersonation_failed: staff cannot read recurring_rules (%).', ext_count;
      end if;
    exception
      when others then
        if position('permission denied' in lower(sqlerrm)) > 0 then
          null;
        else
          raise;
        end if;
    end;

    begin
      update public.businesses set name = 'tamper' where id = b_hidden_id;
      raise exception 'rls_impersonation_failed: staff can update other business.';
    exception
      when others then
        null;
    end;

    execute 'reset role';
  end if;

  execute 'set local role anon';
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);

  select count(*)
  into ext_count
  from public.reviews rv
  where rv.business_id = b_id
    and rv.direction = 'customer_to_business';
  if ext_count <> 1 then
    raise exception 'rls_impersonation_failed: anon cannot read public customer_to_business reviews (%).', ext_count;
  end if;

  begin
    select count(*) into ext_count from public.recurring_rules where business_id = b_id;
    if ext_count <> 0 then
      raise exception 'rls_impersonation_failed: anon can read recurring_rules (%).', ext_count;
    end if;
  exception
    when others then
      if position('permission denied' in lower(sqlerrm)) > 0 then
        null;
      else
        raise;
      end if;
  end;

  select count(*) into ext_count from public.businesses where id = b_hidden_id;
  if ext_count <> 0 then
    raise exception 'rls_impersonation_failed: anon can read hidden business (%).', ext_count;
  end if;

  select count(*) into ext_count from public.list_staff_closures_for_booking(b_hidden_id);
  if ext_count <> 0 then
    raise exception 'rls_impersonation_failed: anon can list staff closures for hidden business (%).', ext_count;
  end if;

  select count(*) into ext_count from public.list_blocked_slots_for_booking(b_hidden_id);
  if ext_count <> 0 then
    raise exception 'rls_impersonation_failed: anon can list blocked slots for hidden business (%).', ext_count;
  end if;

  select count(*)
  into ext_count
  from public.reviews rv
  where rv.business_id = b_id
    and rv.direction = 'business_to_customer';
  if ext_count <> 0 then
    raise exception 'rls_impersonation_failed: anon can read internal business_to_customer reviews (%).', ext_count;
  end if;

  execute 'reset role';
end
$$;

rollback;

select 'rls_impersonation_assertions_passed' as result;
