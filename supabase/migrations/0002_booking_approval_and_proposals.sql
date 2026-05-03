do $$
begin
  if exists (select 1 from pg_type where typname = 'booking_status') then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'booking_status' and e.enumlabel = 'change_proposed'
    ) then
      alter type booking_status add value 'change_proposed';
    end if;
  end if;
end
$$;

alter table bookings
  add column if not exists approved_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists rejected_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists proposed_start_at timestamptz,
  add column if not exists proposed_end_at timestamptz,
  add column if not exists proposal_message text,
  add column if not exists proposal_created_at timestamptz;

