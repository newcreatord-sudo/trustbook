-- 0144_ai_predictions_and_agent_runs.sql
--
-- Storage for AI predictions and conversational agent runs.
--
--   * ai_predictions — every (business, signal, model) prediction with its
--     input fingerprint, output, confidence, and ground-truth outcome.
--   * ai_agent_runs — every LLM-backed agent invocation (tool scope, prompt
--     hash, latency, cost cents, status, audit metadata).
--
-- These tables are append-only by app code; cleanup is left to retention jobs.

create table if not exists public.ai_predictions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid null references public.businesses(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  model text not null,
  model_version text null,
  signal text not null,
  input_fingerprint text not null,
  input_features jsonb not null default '{}'::jsonb,
  prediction jsonb not null,
  confidence numeric(4, 3) null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  ground_truth jsonb null,
  outcome text null check (outcome is null or outcome in ('correct', 'incorrect', 'partial', 'unknown')),
  outcome_recorded_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_predictions_business_signal_idx on public.ai_predictions (business_id, signal, created_at desc);
create index if not exists ai_predictions_fp_idx on public.ai_predictions (input_fingerprint);

alter table public.ai_predictions enable row level security;

drop policy if exists ai_predictions_select_business on public.ai_predictions;
create policy ai_predictions_select_business on public.ai_predictions
  for select to authenticated
  using (
    business_id is null and user_id = auth.uid()
    or exists (
      select 1 from public.businesses b
      where b.id = ai_predictions.business_id and b.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.team_members tm
      where tm.business_id = ai_predictions.business_id and tm.user_id = auth.uid()
    )
    or public.is_platform_admin()
  );

drop policy if exists ai_predictions_insert_none on public.ai_predictions;
create policy ai_predictions_insert_none on public.ai_predictions
  for insert to authenticated
  with check (false);

drop policy if exists ai_predictions_write_none on public.ai_predictions;
create policy ai_predictions_write_none on public.ai_predictions
  for all to authenticated
  using (false)
  with check (false);

create table if not exists public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_scope text not null,
  model text not null,
  prompt_hash text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb null,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  error_message text null,
  duration_ms int null,
  prompt_tokens int null,
  completion_tokens int null,
  cost_cents int null,
  request_id text null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists ai_agent_runs_user_idx on public.ai_agent_runs (user_id, created_at desc);
create index if not exists ai_agent_runs_business_idx on public.ai_agent_runs (business_id, created_at desc);
create index if not exists ai_agent_runs_status_idx on public.ai_agent_runs (status, created_at desc);

alter table public.ai_agent_runs enable row level security;

drop policy if exists ai_agent_runs_select_self on public.ai_agent_runs;
create policy ai_agent_runs_select_self on public.ai_agent_runs
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists ai_agent_runs_insert_self on public.ai_agent_runs;
create policy ai_agent_runs_insert_self on public.ai_agent_runs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists ai_agent_runs_update_self on public.ai_agent_runs;
create policy ai_agent_runs_update_self on public.ai_agent_runs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists ai_agent_runs_delete_none on public.ai_agent_runs;
create policy ai_agent_runs_delete_none on public.ai_agent_runs
  for delete to authenticated
  using (false);

-- Budget guardrail: cap concurrent active runs per user (anti-runaway).
create or replace function public.assert_ai_run_budget(p_user uuid, p_max int default 3)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  active int;
begin
  select count(*) into active
  from public.ai_agent_runs
  where user_id = p_user
    and status in ('queued', 'running')
    and created_at > now() - interval '5 minutes';
  if active >= greatest(1, coalesce(p_max, 3)) then
    raise exception 'ai_run_budget_exceeded';
  end if;
end;
$$;

revoke all on function public.assert_ai_run_budget(uuid, int) from public;
grant execute on function public.assert_ai_run_budget(uuid, int) to authenticated;
