-- Slot pubblici: blocchi agenda e chiusure staff senza SELECT globale cross-business.
-- RPC SECURITY DEFINER per anon/authenticated sul solo p_business_id noto.

CREATE OR REPLACE FUNCTION public.list_staff_closures_for_booking(p_business_id uuid)
RETURNS TABLE (
  staff_id uuid,
  start_at timestamptz,
  end_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sc.staff_id, sc.start_at, sc.end_at
  FROM public.staff_closures sc
  INNER JOIN public.team_members tm ON tm.id = sc.staff_id AND tm.business_id = sc.business_id
  WHERE sc.business_id = p_business_id
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id)
    AND COALESCE(tm.is_bookable, true) IS TRUE;
$$;

CREATE OR REPLACE FUNCTION public.list_blocked_slots_for_booking(p_business_id uuid)
RETURNS TABLE (
  staff_id uuid,
  start_at timestamptz,
  end_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bs.staff_id, bs.start_at, bs.end_at
  FROM public.blocked_slots bs
  WHERE bs.business_id = p_business_id
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id);
$$;

REVOKE ALL ON FUNCTION public.list_staff_closures_for_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_staff_closures_for_booking(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.list_staff_closures_for_booking(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_blocked_slots_for_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_blocked_slots_for_booking(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.list_blocked_slots_for_booking(uuid) TO authenticated;

DROP POLICY IF EXISTS "Public read staff_closures" ON public.staff_closures;
DROP POLICY IF EXISTS "Team read staff_closures" ON public.staff_closures;

CREATE POLICY "Team read staff_closures" ON public.staff_closures
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.business_id = staff_closures.business_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public read blocked_slots" ON public.blocked_slots;
DROP POLICY IF EXISTS "Team read blocked_slots" ON public.blocked_slots;

CREATE POLICY "Team read blocked_slots" ON public.blocked_slots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.business_id = blocked_slots.business_id
        AND tm.user_id = auth.uid()
    )
  );
