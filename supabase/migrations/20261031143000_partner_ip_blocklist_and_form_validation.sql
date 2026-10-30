CREATE TABLE IF NOT EXISTS public.agency_ip_blacklist (
  ip_address inet PRIMARY KEY,
  reason text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_ip_blacklist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agency_ip_blacklist FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agency_ip_blacklist TO service_role;

CREATE OR REPLACE FUNCTION public.guard_blacklisted_registration_ip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.sign_up_ip IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agency_ip_blacklist b
    WHERE b.ip_address = NEW.sign_up_ip AND b.is_active
  ) THEN
    RAISE EXCEPTION 'Registration is not available from this network';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_blacklisted_ip ON public.profiles;
CREATE TRIGGER profiles_block_blacklisted_ip
  BEFORE INSERT OR UPDATE OF sign_up_ip ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_blacklisted_registration_ip();

CREATE OR REPLACE FUNCTION public.blacklist_partner_ip(p_user_id uuid, p_reason text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ip inet;
  v_target_role text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'Super_Admin' AND p.access_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid blacklist target';
  END IF;

  SELECT p.sign_up_ip, p.role INTO v_ip, v_target_role
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_ip IS NULL OR v_target_role IS NULL OR v_target_role = 'Super_Admin' THEN
    RAISE EXCEPTION 'This account cannot be blacklisted by IP';
  END IF;

  INSERT INTO public.agency_ip_blacklist (ip_address, reason, is_active, created_by, updated_at)
  VALUES (v_ip, left(trim(COALESCE(p_reason, '')), 300), true, auth.uid(), now())
  ON CONFLICT (ip_address) DO UPDATE SET
    reason = EXCLUDED.reason,
    is_active = true,
    created_by = EXCLUDED.created_by,
    updated_at = now();

  UPDATE public.profiles
  SET access_status = 'banned', updated_at = now()
  WHERE sign_up_ip = v_ip AND role <> 'Super_Admin';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.blacklist_partner_ip(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blacklist_partner_ip(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_agency_ip_blacklist_status(p_ip inet, p_is_active boolean)
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

  UPDATE public.agency_ip_blacklist
  SET is_active = p_is_active, updated_at = now()
  WHERE ip_address = p_ip;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_agency_ip_blacklist_status(inet, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_agency_ip_blacklist_status(inet, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_agency_ip_blacklist()
RETURNS TABLE(ip_address text, reason text, is_active boolean, created_at timestamptz)
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
  SELECT b.ip_address::text, b.reason, b.is_active, b.created_at
  FROM public.agency_ip_blacklist b
  ORDER BY b.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_agency_ip_blacklist() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_agency_ip_blacklist() TO authenticated;

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

  IF trim(COALESCE(p_order_form_url, '')) !~* '^https://(docs[.]google[.]com/forms/|forms[.]gle/)'
    OR trim(COALESCE(p_refund_form_url, '')) !~* '^https://(docs[.]google[.]com/forms/|forms[.]gle/)' THEN
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
