REVOKE EXECUTE ON FUNCTION public.complete_partner_onboarding(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_partner_onboarding(text, text, inet, text) FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
