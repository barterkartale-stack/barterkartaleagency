/*
# Harden partner profile writes

1. Security Change
- Remove direct profile INSERT and UPDATE privileges from authenticated users.
- Keep profile creation and onboarding completion inside the authenticated, owner-checked onboarding function.
- This prevents a browser caller from assigning itself Ground_Manager or changing its onboarding state.
*/

REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
