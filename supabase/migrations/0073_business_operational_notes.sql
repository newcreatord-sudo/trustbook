create table if not exists public.business_operational_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text,
  body text not null default '',
  tags text[] not null default '{}'::text[],
  pinned boolean not null default false,
  agent_id text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_operational_notes_business_id_idx
  on public.business_operational_notes (business_id);

create index if not exists business_operational_notes_business_id_pinned_updated_idx
  on public.business_operational_notes (business_id, pinned desc, updated_at desc);

alter table public.business_operational_notes enable row level security;

drop policy if exists business_operational_notes_member_read on public.business_operational_notes;
create policy business_operational_notes_member_read on public.business_operational_notes
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists business_operational_notes_member_insert on public.business_operational_notes;
create policy business_operational_notes_member_insert on public.business_operational_notes
  for insert to authenticated
  with check (
    public.is_business_member(business_id)
    and created_by_user_id = auth.uid()
  );

drop policy if exists business_operational_notes_owner_or_author_update on public.business_operational_notes;
create policy business_operational_notes_owner_or_author_update on public.business_operational_notes
  for update to authenticated
  using (
    public.is_business_owner(business_id)
    or created_by_user_id = auth.uid()
  )
  with check (
    public.is_business_owner(business_id)
    or created_by_user_id = auth.uid()
  );

drop policy if exists business_operational_notes_owner_or_author_delete on public.business_operational_notes;
create policy business_operational_notes_owner_or_author_delete on public.business_operational_notes
  for delete to authenticated
  using (
    public.is_business_owner(business_id)
    or created_by_user_id = auth.uid()
  );

grant select, insert, update, delete on public.business_operational_notes to authenticated;
revoke all on public.business_operational_notes from anon;

alter table public.business_booking_ecosystem
  add column if not exists ai_notes_enabled boolean not null default false;

create or replace function public.upsert_business_operational_note(
  p_business_id uuid,
  p_note_id uuid default null,
  p_title text default null,
  p_body text default '',
  p_tags text[] default '{}'::text[],
  p_pinned boolean default false,
  p_agent_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid;
  v_agent text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_member(p_business_id) then
    raise exception 'member_only';
  end if;

  v_actor := auth.uid();
  v_agent := nullif(trim(coalesce(p_agent_id, '')), '');

  if v_agent is not null then
    if not public.is_business_owner(p_business_id) then
      raise exception 'owner_only';
    end if;
    if not exists (
      select 1 from public.business_booking_ecosystem e
      where e.business_id = p_business_id and e.ai_notes_enabled = true
    ) then
      raise exception 'ai_notes_disabled';
    end if;
  end if;

  if p_note_id is null then
    insert into public.business_operational_notes (business_id, title, body, tags, pinned, agent_id, created_by_user_id)
    values (
      p_business_id,
      nullif(trim(coalesce(p_title, '')), ''),
      left(coalesce(p_body, ''), 8000),
      coalesce(p_tags, '{}'::text[]),
      coalesce(p_pinned, false),
      v_agent,
      v_actor
    )
    returning id into v_id;
  else
    update public.business_operational_notes
    set
      title = nullif(trim(coalesce(p_title, '')), ''),
      body = left(coalesce(p_body, ''), 8000),
      tags = coalesce(p_tags, '{}'::text[]),
      pinned = coalesce(p_pinned, false),
      agent_id = coalesce(v_agent, agent_id),
      updated_at = now()
    where id = p_note_id and business_id = p_business_id
    returning id into v_id;

    if v_id is null then
      raise exception 'note_not_found';
    end if;
  end if;

  if v_agent is not null then
    begin
      insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
      values (
        p_business_id,
        v_agent,
        'upsert_business_operational_note',
        jsonb_build_object(
          'note_id', v_id,
          'title', nullif(trim(coalesce(p_title, '')), ''),
          'pinned', coalesce(p_pinned, false),
          'tags', to_jsonb(coalesce(p_tags, '{}'::text[]))
        ),
        jsonb_build_object('status', 'ok'),
        v_actor
      );
    exception when others then
      null;
    end;
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_business_operational_note(uuid, uuid, text, text, text[], boolean, text) from public;
grant execute on function public.upsert_business_operational_note(uuid, uuid, text, text, text[], boolean, text) to authenticated;

create or replace function public.delete_business_operational_note(
  p_business_id uuid,
  p_note_id uuid,
  p_agent_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_agent text;
  v_deleted boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_member(p_business_id) then
    raise exception 'member_only';
  end if;

  v_actor := auth.uid();
  v_agent := nullif(trim(coalesce(p_agent_id, '')), '');

  if v_agent is not null then
    if not public.is_business_owner(p_business_id) then
      raise exception 'owner_only';
    end if;
    if not exists (
      select 1 from public.business_booking_ecosystem e
      where e.business_id = p_business_id and e.ai_notes_enabled = true
    ) then
      raise exception 'ai_notes_disabled';
    end if;
  end if;

  delete from public.business_operational_notes
  where id = p_note_id and business_id = p_business_id
  returning true into v_deleted;

  if not coalesce(v_deleted, false) then
    raise exception 'note_not_found';
  end if;

  if v_agent is not null then
    begin
      insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
      values (
        p_business_id,
        v_agent,
        'delete_business_operational_note',
        jsonb_build_object('note_id', p_note_id),
        jsonb_build_object('status', 'ok'),
        v_actor
      );
    exception when others then
      null;
    end;
  end if;
end;
$$;

revoke all on function public.delete_business_operational_note(uuid, uuid, text) from public;
grant execute on function public.delete_business_operational_note(uuid, uuid, text) to authenticated;

