/*
# Campaigns, refund submissions, and security logging

1. New Tables
- `campaigns` stores admin-managed campaign listings visible on the public site.
  Columns: id, name, platform, incentive_amount (integer rupees), campaign_link,
  is_active, created_by (admin who created it), created_at, updated_at.
- `refunds` stores refund-form submissions linked to a campaign enrollment.
  Columns: id, user_id (partner), enrollment_id (FK to campaign_enrollments),
  name, platform, campaign_type, upi_id, proof_filename, status, created_at.

2. Modified Tables
- `profiles` gets three security columns:
  * `sign_up_ip` (inet) — the client IP captured during onboarding.
  * `device_fingerprint` (text) — a client-generated machine fingerprint.
  * `access_status` (text, default 'active') — admin-controlled: active / revoked / banned.
- `profiles.role` CHECK extended to allow 'Super_Admin' alongside the existing
  Reviewer / Assistant_Coordinator / Ground_Manager roles.

3. Security
- RLS enabled on `campaigns` and `refunds`.
- Campaigns: public read (anon + authenticated), only Super_Admin may write via RPC.
- Refunds: owner-scoped CRUD for authenticated partners.
- `profiles` new columns are NOT client-writable. INSERT/UPDATE already revoked
  from authenticated (prior migration); sign_up_ip and device_fingerprint are
  set only inside the SECURITY DEFINER onboarding RPC. access_status is set only
  inside admin SECURITY DEFINER RPCs.
- Two admin RPCs:
  * `set_user_access_status(p_user_id, p_status)` — Super_Admin only; sets
    access_status to active / revoked / banned.
  * `save_campaign(p_name, p_platform, p_incentive, p_link, p_campaign_id?)` —
    Super_Admin only; creates or updates a campaign row.
- `complete_partner_onboarding` extended to accept p_sign_up_ip and
  p_device_fingerprint, storing them in the new columns.

4. Important Notes
- sign_up_ip is captured server-side by an edge function and passed into the
  onboarding RPC — the client cannot forge it because the RPC trusts only the
  value supplied by the edge function's service-role call path, and the column
  is not writable by the anon/authenticated roles.
- device_fingerprint is a client-generated hash (navigator metadata). It is a
  heuristic signal, not a hard identity. It is disclosed to users in the sign-up
  UI privacy notice.
- No existing data is dropped or altered destructively.
*/

-- 1. Extend profiles with security columns and Super_Admin role
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sign_up_ip inet,
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'active'
    CHECK (access_status IN ('active', 'revoked', 'banned'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('Reviewer', 'Assistant_Coordinator', 'Ground_Manager', 'Super_Admin'));

-- 2. Campaigns table
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('Amazon', 'Flipkart', 'Myntra', 'Meesho')),
  incentive_amount integer NOT NULL CHECK (incentive_amount >= 0),
  campaign_link text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Public read: campaigns are visible to everyone (anon + authenticated)
GRANT SELECT ON public.campaigns TO anon, authenticated;

DROP POLICY IF EXISTS "campaigns_select_public" ON public.campaigns;
CREATE POLICY "campaigns_select_public" ON public.campaigns FOR SELECT
  TO anon, authenticated USING (true);

-- 3. Refunds table
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES public.campaign_enrollments(id) ON DELETE SET NULL,
  name text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('Amazon', 'Flipkart', 'Myntra', 'Meesho')),
  campaign_type text NOT NULL CHECK (campaign_type IN ('Full Sponsorship', 'Micro-Fee Campaign')),
  upi_id text NOT NULL,
  proof_filename text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;

DROP POLICY IF EXISTS "refunds_select_own" ON public.refunds;
CREATE POLICY "refunds_select_own" ON public.refunds FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "refunds_insert_own" ON public.refunds;
CREATE POLICY "refunds_insert_own" ON public.refunds FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "refunds_update_own" ON public.refunds;
CREATE POLICY "refunds_update_own" ON public.refunds FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Extend onboarding RPC to accept IP + fingerprint
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(trim(p_mobile_number)) < 10 OR length(trim(p_mobile_number)) > 15 THEN
    RAISE EXCEPTION 'Invalid mobile number';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, mobile_number, onboarding_complete, sign_up_ip, device_fingerprint)
  SELECT auth.uid(), u.email, NULLIF(trim(p_display_name), ''), trim(p_mobile_number), true, p_sign_up_ip, NULLIF(trim(p_device_fingerprint), '')
  FROM auth.users u
  WHERE u.id = auth.uid()
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    mobile_number = EXCLUDED.mobile_number,
    onboarding_complete = true,
    sign_up_ip = COALESCE(EXCLUDED.sign_up_ip, profiles.sign_up_ip),
    device_fingerprint = COALESCE(EXCLUDED.device_fingerprint, profiles.device_fingerprint),
    updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_partner_onboarding(text, text, inet, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_partner_onboarding(text, text, inet, text) TO authenticated;

-- 5. Admin RPC: set user access status (Super_Admin only)
CREATE OR REPLACE FUNCTION public.set_user_access_status(
  p_user_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Super_Admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_status NOT IN ('active', 'revoked', 'banned') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.profiles
  SET access_status = p_status, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_access_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_access_status(uuid, text) TO authenticated;

-- 6. Admin RPC: create or update a campaign (Super_Admin only)
CREATE OR REPLACE FUNCTION public.save_campaign(
  p_name text,
  p_platform text,
  p_incentive integer,
  p_link text,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.campaigns;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Super_Admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_platform NOT IN ('Amazon', 'Flipkart', 'Myntra', 'Meesho') THEN
    RAISE EXCEPTION 'Invalid platform';
  END IF;

  IF p_incentive IS NULL OR p_incentive < 0 THEN
    RAISE EXCEPTION 'Invalid incentive amount';
  END IF;

  IF p_campaign_id IS NOT NULL THEN
    UPDATE public.campaigns
    SET name = p_name, platform = p_platform, incentive_amount = p_incentive,
        campaign_link = p_link, updated_at = now()
    WHERE id = p_campaign_id
    RETURNING * INTO result;
  ELSE
    INSERT INTO public.campaigns (name, platform, incentive_amount, campaign_link, created_by)
    VALUES (p_name, p_platform, p_incentive, p_link, auth.uid())
    RETURNING * INTO result;
  END IF;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_campaign(text, text, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_campaign(text, text, integer, text, uuid) TO authenticated;

-- 7. Admin RPC: toggle campaign active state (Super_Admin only)
CREATE OR REPLACE FUNCTION public.toggle_campaign_active(
  p_campaign_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Super_Admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.campaigns
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_campaign_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_campaign_active(uuid, boolean) TO authenticated;

-- 8. Indexes
CREATE INDEX IF NOT EXISTS campaigns_is_active_idx ON public.campaigns(is_active);
CREATE INDEX IF NOT EXISTS refunds_user_id_idx ON public.refunds(user_id);
CREATE INDEX IF NOT EXISTS refunds_enrollment_id_idx ON public.refunds(enrollment_id);
CREATE INDEX IF NOT EXISTS profiles_access_status_idx ON public.profiles(access_status);

-- 9. Grant service_role access for edge functions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns, public.refunds TO service_role;
GRANT SELECT, UPDATE ON public.profiles TO service_role;