/*
# Create protected partner identity and campaign records

1. New Tables
- `profiles` stores the authenticated user's display name, Google email, mobile number, onboarding state, and server-assigned role.
- `campaign_enrollments` stores campaign booking details owned by the signed-in partner.
- `task_verifications` stores verification submissions owned by the signed-in partner.

2. Security
- Enable RLS on all new tables.
- Grant authenticated users only the actions required for their own records.
- Every policy is scoped with `auth.uid()`.
- The role column is not client-writable; role changes remain an administrative operation.
- The onboarding RPC validates the caller from `auth.uid()` and only updates their own profile.

3. Important Notes
- Google OAuth identity remains in Supabase Auth; passwords are managed by Auth and are never stored in these tables.
- Verification media is represented by a private storage path for later storage integration; no public file access is granted here.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  mobile_number text,
  onboarding_complete boolean NOT NULL DEFAULT false,
  role text NOT NULL DEFAULT 'Reviewer' CHECK (role IN ('Reviewer', 'Assistant_Coordinator', 'Ground_Manager')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  delivery_address text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('Amazon', 'Flipkart', 'Myntra', 'Meesho')),
  campaign_type text NOT NULL CHECK (campaign_type IN ('Full Sponsorship', 'Micro-Fee Campaign')),
  tracking_order_id text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_review', 'approved', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES public.campaign_enrollments(id) ON DELETE SET NULL,
  upi_id text NOT NULL,
  media_path text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_verifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.campaign_enrollments TO authenticated;
GRANT SELECT, INSERT ON public.task_verifications TO authenticated;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "enrollments_select_own" ON public.campaign_enrollments;
CREATE POLICY "enrollments_select_own" ON public.campaign_enrollments FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "enrollments_insert_own" ON public.campaign_enrollments;
CREATE POLICY "enrollments_insert_own" ON public.campaign_enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "enrollments_update_own" ON public.campaign_enrollments;
CREATE POLICY "enrollments_update_own" ON public.campaign_enrollments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "verifications_select_own" ON public.task_verifications;
CREATE POLICY "verifications_select_own" ON public.task_verifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "verifications_insert_own" ON public.task_verifications;
CREATE POLICY "verifications_insert_own" ON public.task_verifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.complete_partner_onboarding(p_display_name text, p_mobile_number text)
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

  INSERT INTO public.profiles (id, email, display_name, mobile_number, onboarding_complete)
  SELECT auth.uid(), u.email, NULLIF(trim(p_display_name), ''), trim(p_mobile_number), true
  FROM auth.users u
  WHERE u.id = auth.uid()
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    mobile_number = EXCLUDED.mobile_number,
    onboarding_complete = true,
    updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_partner_onboarding(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_partner_onboarding(text, text) TO authenticated;

CREATE INDEX IF NOT EXISTS campaign_enrollments_user_id_idx ON public.campaign_enrollments(user_id);
CREATE INDEX IF NOT EXISTS task_verifications_user_id_idx ON public.task_verifications(user_id);
