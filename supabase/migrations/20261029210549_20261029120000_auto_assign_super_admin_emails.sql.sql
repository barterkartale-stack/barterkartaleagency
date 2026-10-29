/*
# Auto-assign Super_Admin role for designated admin emails

1. Changes
- Modify `complete_partner_onboarding` to check the user's email from auth.users.
  If the email matches one of two designated admin addresses, the profile's role
  is set to 'Super_Admin' instead of the default 'Reviewer'.
- Designated admin emails: barterkartale@gmail.com, isiddharthsonkar@gmail.com
- This is enforced server-side inside the SECURITY DEFINER function, so the
  client cannot forge or bypass it.

2. Security
- No new tables or columns.
- No policy changes. The role column remains non-client-writable.
- The check runs inside the existing owner-checked onboarding RPC.
*/

CREATE OR REPLACE FUNCTION public.complete_partner_onboarding(
  p_display_name text,
  p_mobile_number text,
  p_sign_up_ip inet DEFAULT NULL,
  p_device_fingerprint text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.profiles;
  v_email text;
  v_role text := 'Reviewer';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(trim(p_mobile_number)) < 10 OR length(trim(p_mobile_number)) > 15 THEN
    RAISE EXCEPTION 'Invalid mobile number';
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = auth.uid();

  IF v_email IN ('barterkartale@gmail.com', 'isiddharthsonkar@gmail.com') THEN
    v_role := 'Super_Admin';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, mobile_number, onboarding_complete, sign_up_ip, device_fingerprint, role)
  SELECT auth.uid(), v_email, NULLIF(trim(p_display_name), ''), trim(p_mobile_number), true, p_sign_up_ip, NULLIF(trim(p_device_fingerprint), ''), v_role
  FROM auth.users u
  WHERE u.id = auth.uid()
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    mobile_number = EXCLUDED.mobile_number,
    onboarding_complete = true,
    sign_up_ip = COALESCE(EXCLUDED.sign_up_ip, profiles.sign_up_ip),
    device_fingerprint = COALESCE(EXCLUDED.device_fingerprint, profiles.device_fingerprint),
    role = CASE
      WHEN profiles.role = 'Super_Admin' THEN profiles.role
      WHEN v_email IN ('barterkartale@gmail.com', 'isiddharthsonkar@gmail.com') THEN 'Super_Admin'
      ELSE profiles.role
    END,
    updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_partner_onboarding(text, text, inet, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_partner_onboarding(text, text, inet, text) TO authenticated;
