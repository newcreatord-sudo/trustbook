-- Pubblica (solo authenticated) lista staff prenotabile per booking cliente.
-- SECURITY DEFINER: legge profiles dei membri senza esporre SELECT globale su team_members.
CREATE OR REPLACE FUNCTION public.list_bookable_staff_for_booking(p_business_id uuid)
RETURNS TABLE (
  id uuid,
  display_name text,
  color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tm.id,
    COALESCE(
      NULLIF(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
      CASE tm.role WHEN 'owner' THEN 'Referente' ELSE 'Professionista' END
    ) AS display_name,
    COALESCE(NULLIF(trim(tm.color), ''), '#3b82f6') AS color
  FROM public.team_members tm
  LEFT JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.business_id = p_business_id
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id)
    AND COALESCE(tm.is_bookable, true) IS TRUE
  ORDER BY display_name ASC, tm.id ASC;
$$;

REVOKE ALL ON FUNCTION public.list_bookable_staff_for_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_bookable_staff_for_booking(uuid) TO authenticated;
