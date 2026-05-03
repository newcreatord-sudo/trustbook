-- Prenotazione cliente + assegnazione risorsa (tavolo/postazione) nella stessa transazione RPC.
-- Evita booking «orfani» se assign/auto-assign fallisce dopo create_booking_v3.

create or replace function public.create_booking_v3_with_resource_assignment(
  p_business_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_staff_id uuid default null,
  p_primary_resource_id uuid default null,
  p_auto_assign_resource boolean default false,
  p_party_size int default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.bookings;
  v_auto uuid;
begin
  if coalesce(p_auto_assign_resource, false) and p_primary_resource_id is not null then
    raise exception 'invalid_resource_assignment_params';
  end if;

  booking_row := public.create_booking_v3(
    p_business_id,
    p_service_id,
    p_start_at,
    p_end_at,
    p_staff_id
  );

  if p_primary_resource_id is not null then
    perform public.assign_table_to_booking(booking_row.id, p_primary_resource_id, p_party_size);
  elsif coalesce(p_auto_assign_resource, false) then
    v_auto := public.auto_assign_resource_for_booking(booking_row.id, p_party_size);
    if v_auto is null then
      raise exception 'auto_resource_assignment_failed';
    end if;
  end if;

  return booking_row;
end;
$$;

revoke all on function public.create_booking_v3_with_resource_assignment(
  uuid, uuid, timestamptz, timestamptz, uuid, uuid, boolean, int
) from public;

grant execute on function public.create_booking_v3_with_resource_assignment(
  uuid, uuid, timestamptz, timestamptz, uuid, uuid, boolean, int
) to authenticated;

comment on function public.create_booking_v3_with_resource_assignment(
  uuid, uuid, timestamptz, timestamptz, uuid, uuid, boolean, int
) is
  'Cliente: crea prenotazione e applica assign_table o auto_assign atomici; rollback completo su errore assegnazione.';
