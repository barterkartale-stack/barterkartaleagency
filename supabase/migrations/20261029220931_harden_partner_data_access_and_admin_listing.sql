/*
# Harden partner data access and admin profile listing

1. Security Changes
- Remove all anonymous access from private profiles, enrollments, refunds, and task verification records.
- Make public campaigns read-only for anonymous and authenticated visitors.
- Narrow authenticated grants to the exact verbs used by the application.
- Keep user records owner-scoped through existing RLS policies.
- Add an admin-only SECURITY DEFINER function for Super_Admin profile listings because normal profile RLS must remain owner-only.

2. Important Notes
- The public campaign catalog remains readable without sign-in.
- Admin profile data is returned only after the function checks the caller's server-side role.
- Existing data is preserved; this migration only tightens privileges and adds the listing function.
*/

REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;

REVOKE ALL ON public.campaign_enrollments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.campaign_enrollments TO authenticated;

REVOKE ALL ON public.refunds FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;

REVOKE ALL ON public.task_verifications FROM anon, authenticated;
GRANT SELECT, INSERT ON public.task_verifications TO authenticated;

REVOKE ALL ON public.campaigns FROM anon, authenticated;
GRANT SELECT ON public.campaigns TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_partner_onboarding(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_admin_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Super_Admin' AND access_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY SELECT p FROM public.profiles p ORDER BY p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_admin_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;
