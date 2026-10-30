CREATE TABLE IF NOT EXISTS public.agency_invitation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 100),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_invitation_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agency_invitation_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agency_invitation_codes TO service_role;

CREATE TABLE IF NOT EXISTS public.google_form_sync_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  order_form_url text NOT NULL DEFAULT '',
  refund_form_url text NOT NULL DEFAULT '',
  order_field_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  refund_field_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_form_sync_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_form_sync_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.google_form_sync_settings TO service_role;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS device_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS security_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS invitation_code_id uuid REFERENCES public.agency_invitation_codes(id) ON DELETE SET NULL;

UPDATE public.profiles
SET registered_at = created_at
WHERE registered_at IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN registered_at SET DEFAULT now(),
  ALTER COLUMN registered_at SET NOT NULL,
  ALTER COLUMN access_status SET DEFAULT 'pending';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_access_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_status_check
  CHECK (access_status IN ('pending', 'active', 'revoked', 'banned'));

ALTER TABLE public.campaign_enrollments
  ADD COLUMN IF NOT EXISTS google_form_sync_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS google_form_sync_error text,
  ADD COLUMN IF NOT EXISTS google_form_synced_at timestamptz;

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS google_form_sync_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS google_form_sync_error text,
  ADD COLUMN IF NOT EXISTS google_form_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS agency_invitation_codes_active_expiry_idx
  ON public.agency_invitation_codes (is_active, expires_at);
CREATE INDEX IF NOT EXISTS profiles_access_status_registered_at_idx
  ON public.profiles (access_status, registered_at DESC);

REVOKE INSERT, UPDATE ON public.campaign_enrollments FROM authenticated;
GRANT INSERT (name, delivery_address, platform, campaign_type, tracking_order_id)
  ON public.campaign_enrollments TO authenticated;
REVOKE INSERT, UPDATE ON public.refunds FROM authenticated;
GRANT INSERT (enrollment_id, name, platform, campaign_type, upi_id, proof_filename)
  ON public.refunds TO authenticated;

DROP POLICY IF EXISTS "enrollments_select_own" ON public.campaign_enrollments;
CREATE POLICY "enrollments_select_own" ON public.campaign_enrollments FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.access_status = 'active'
    )
  );

DROP POLICY IF EXISTS "enrollments_insert_own" ON public.campaign_enrollments;
CREATE POLICY "enrollments_insert_own" ON public.campaign_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.access_status = 'active'
    )
  );

DROP POLICY IF EXISTS "enrollments_update_own" ON public.campaign_enrollments;
CREATE POLICY "enrollments_update_own" ON public.campaign_enrollments FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.access_status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.access_status = 'active'
    )
  );

DROP POLICY IF EXISTS "refunds_select_own" ON public.refunds;
CREATE POLICY "refunds_select_own" ON public.refunds FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.access_status = 'active'
    )
  );

DROP POLICY IF EXISTS "refunds_insert_own" ON public.refunds;
CREATE POLICY "refunds_insert_own" ON public.refunds FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.access_status = 'active'
    )
  );

DROP POLICY IF EXISTS "refunds_update_own" ON public.refunds;
CREATE POLICY "refunds_update_own" ON public.refunds FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.access_status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.access_status = 'active'
    )
  );

CREATE OR REPLACE FUNCTION public.issue_agency_invitation_code(
  p_max_uses integer DEFAULT 1,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE(code text, id uuid, max_uses integer, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'Super_Admin' AND p.access_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_max_uses IS NULL OR p_max_uses < 1 OR p_max_uses > 100 THEN
    RAISE EXCEPTION 'Invalid invitation usage limit';
  END IF;

  v_expires_at := COALESCE(p_expires_at, now() + interval '7 days');
  IF v_expires_at <= now() OR v_expires_at > now() + interval '90 days' THEN
    RAISE EXCEPTION 'Invalid invitation expiry';
  END IF;

  v_code := 'BK-' || upper(replace(gen_random_uuid()::text, '-', ''));
  INSERT INTO public.agency_invitation_codes (code_hash, max_uses, expires_at, created_by)
  VALUES (
    encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'),
    p_max_uses,
    v_expires_at,
    auth.uid()
  )
  RETURNING agency_invitation_codes.id INTO v_id;

  RETURN QUERY SELECT v_code, v_id, p_max_uses, v_expires_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_agency_invitation_code(integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_agency_invitation_code(integer, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_partner_registration(
  p_user_id uuid,
  p_invitation_code_hash text,
  p_display_name text,
  p_mobile_number text,
  p_sign_up_ip inet,
  p_device_fingerprint text,
  p_device_metadata jsonb,
  p_security_consent boolean
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles;
  v_email text;
  v_role text := 'Reviewer';
  v_access_status text := 'pending';
  v_invitation_id uuid;
BEGIN
  IF NOT COALESCE(p_security_consent, false) THEN
    RAISE EXCEPTION 'Security data consent is required';
  END IF;

  IF p_user_id IS NULL OR p_invitation_code_hash IS NULL OR length(p_invitation_code_hash) <> 64 THEN
    RAISE EXCEPTION 'Invalid registration details';
  END IF;

  IF p_display_name IS NULL OR length(trim(p_display_name)) < 2 OR length(trim(p_display_name)) > 100 THEN
    RAISE EXCEPTION 'Invalid name';
  END IF;

  IF p_mobile_number IS NULL OR trim(p_mobile_number) !~ '^[0-9+() -]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid mobile number';
  END IF;

  IF jsonb_typeof(COALESCE(p_device_metadata, '{}'::jsonb)) <> 'object'
    OR length(COALESCE(p_device_fingerprint, '')) > 128 THEN
    RAISE EXCEPTION 'Invalid device metadata';
  END IF;

  SELECT p.* INTO v_profile
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF FOUND AND v_profile.onboarding_complete THEN
    RETURN v_profile;
  END IF;

  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id AND u.email IS NOT NULL;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Registered account not found';
  END IF;

  UPDATE public.agency_invitation_codes c
  SET used_count = c.used_count + 1
  WHERE c.code_hash = p_invitation_code_hash
    AND c.is_active
    AND c.expires_at > now()
    AND c.used_count < c.max_uses
  RETURNING c.id INTO v_invitation_id;

  IF v_invitation_id IS NULL THEN
    RAISE EXCEPTION 'Invitation code is invalid or expired';
  END IF;

  IF v_email IN ('barterkartale@gmail.com', 'isiddharthsonkar@gmail.com') THEN
    v_role := 'Super_Admin';
    v_access_status := 'active';
  END IF;

  INSERT INTO public.profiles (
    id, email, display_name, mobile_number, onboarding_complete, role,
    access_status, sign_up_ip, device_fingerprint, device_metadata,
    security_consent_at, registered_at, invitation_code_id
  )
  VALUES (
    p_user_id, v_email, trim(p_display_name), trim(p_mobile_number), true, v_role,
    v_access_status, p_sign_up_ip, NULLIF(trim(p_device_fingerprint), ''),
    COALESCE(p_device_metadata, '{}'::jsonb), now(), now(), v_invitation_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    mobile_number = EXCLUDED.mobile_number,
    onboarding_complete = true,
    sign_up_ip = COALESCE(EXCLUDED.sign_up_ip, public.profiles.sign_up_ip),
    device_fingerprint = COALESCE(EXCLUDED.device_fingerprint, public.profiles.device_fingerprint),
    device_metadata = EXCLUDED.device_metadata,
    security_consent_at = now(),
    registered_at = now(),
    invitation_code_id = EXCLUDED.invitation_code_id,
    role = CASE
      WHEN public.profiles.role = 'Super_Admin' THEN public.profiles.role
      WHEN v_role = 'Super_Admin' THEN 'Super_Admin'
      ELSE public.profiles.role
    END,
    access_status = CASE
      WHEN public.profiles.role = 'Super_Admin' THEN public.profiles.access_status
      ELSE v_access_status
    END,
    updated_at = now()
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_partner_registration(uuid, text, text, text, inet, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_partner_registration(uuid, text, text, text, inet, text, jsonb, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.set_user_access_status(p_user_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'Super_Admin' AND p.access_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_status NOT IN ('pending', 'active', 'revoked', 'banned') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF p_user_id = auth.uid() AND p_status <> 'active' THEN
    RAISE EXCEPTION 'You cannot change your own access status';
  END IF;

  UPDATE public.profiles
  SET access_status = p_status, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_access_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_access_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_admin_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'Super_Admin' AND p.access_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT p FROM public.profiles p
  ORDER BY p.registered_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_admin_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_google_form_settings()
RETURNS public.google_form_sync_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.google_form_sync_settings;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'Super_Admin' AND p.access_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT s.* INTO v_settings
  FROM public.google_form_sync_settings s
  WHERE s.id = true;

  RETURN v_settings;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_google_form_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_google_form_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_google_form_settings(
  p_order_form_url text,
  p_refund_form_url text,
  p_order_field_map jsonb,
  p_refund_field_map jsonb
)
RETURNS public.google_form_sync_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.google_form_sync_settings;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'Super_Admin' AND p.access_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_order_form_url !~* '^https://(docs\.google\.com/forms/|forms\.gle/)' OR p_refund_form_url !~* '^https://(docs\.google\.com/forms/|forms\.gle/)' THEN
    RAISE EXCEPTION 'Google Forms links must use an approved Google Forms URL';
  END IF;

  IF jsonb_typeof(p_order_field_map) <> 'object' OR jsonb_typeof(p_refund_field_map) <> 'object' THEN
    RAISE EXCEPTION 'Invalid field map';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(p_order_field_map) m
    WHERE m.value <> '' AND m.value !~ '^[0-9]{1,20}$'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_each_text(p_refund_field_map) m
    WHERE m.value <> '' AND m.value !~ '^[0-9]{1,20}$'
  ) THEN
    RAISE EXCEPTION 'Invalid Google Forms field mapping';
  END IF;

  INSERT INTO public.google_form_sync_settings (
    id, order_form_url, refund_form_url, order_field_map, refund_field_map, updated_by, updated_at
  )
  VALUES (
    true, trim(p_order_form_url), trim(p_refund_form_url), p_order_field_map,
    p_refund_field_map, auth.uid(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    order_form_url = EXCLUDED.order_form_url,
    refund_form_url = EXCLUDED.refund_form_url,
    order_field_map = EXCLUDED.order_field_map,
    refund_field_map = EXCLUDED.refund_field_map,
    updated_by = EXCLUDED.updated_by,
    updated_at = now()
  RETURNING * INTO v_settings;

  RETURN v_settings;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_google_form_settings(text, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_google_form_settings(text, text, jsonb, jsonb) TO authenticated;
