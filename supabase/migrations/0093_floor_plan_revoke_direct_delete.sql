-- TrustBook planimetria: niente DELETE diretto sulla tabella piani da ruolo authenticated.
-- L’unico percorso supportato è `delete_floor_plan` (SECURITY DEFINER, owner-only).

revoke delete on table public.business_floor_plans from authenticated;

comment on table public.business_floor_plans is
  'Piani sala TrustBook: INSERT/UPDATE/SELECT via membri business (RLS); DELETE solo tramite RPC delete_floor_plan.';
