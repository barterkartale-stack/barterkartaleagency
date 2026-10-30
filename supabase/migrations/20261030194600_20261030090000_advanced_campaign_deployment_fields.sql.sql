/*
# Advanced campaign deployment fields

1. Modified Tables
- `campaigns` gains:
  * `tags` (text array) — categories chosen from a fixed list, used for public filtering.
  * `specifications` (text) — free-form technical details, product guidelines, and terms for each drop (up to 5000 characters).

2. Security
- Public (anon and authenticated) can read only active campaigns. Super_Admin can read all campaigns, including paused ones.
- `save_campaign` is rebuilt to validate every input on the server: title length, platform list, incentive range (0 to 1,000,000 Rupees), an http or https destination URL, tags restricted to the allowed list, and specification length.
- The previous 5-argument `save_campaign` is removed and replaced by the 7-argument version. No campaign data is deleted.
- EXECUTE is revoked from PUBLIC and anon; granted to authenticated only. Each call still checks the caller is Super_Admin.

3. Important Notes
- Existing campaigns keep their data and receive empty tags and specifications.
*/

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS specifications text NOT NULL DEFAULT '';

DROP POLICY IF EXISTS "campaigns_select_public" ON public.campaigns;
CREATE POLICY "campaigns_select_public" ON public.campaigns FOR SELECT
  TO anon, authenticated
  USING (
    is_active
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'Super_Admin'
    )
  );

DROP FUNCTION IF EXISTS public.save_campaign(text, text, integer, text, uuid);

CREATE OR REPLACE FUNCTION public.save_campaign(
  p_name text,
  p_platform text,
  p_incentive integer,
  p_link text,
  p_campaign_id uuid DEFAULT NULL,
  p_tags text[] DEFAULT '{}',
  p_specifications text DEFAULT ''
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.campaigns;
  allowed_tags text[] := ARRAY['Electronics', 'Home', 'Beauty', 'Fashion', 'Kitchen', 'Audio', 'Personal Care', 'Appliances'];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Super_Admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 OR length(p_name) > 120 THEN
    RAISE EXCEPTION 'Invalid campaign title';
  END IF;

  IF p_platform NOT IN ('Amazon', 'Flipkart', 'Myntra', 'Meesho') THEN
    RAISE EXCEPTION 'Invalid platform';
  END IF;

  IF p_incentive IS NULL OR p_incentive < 0 OR p_incentive > 1000000 THEN
    RAISE EXCEPTION 'Invalid incentive amount';
  END IF;

  IF p_link IS NULL OR p_link !~* '^https?://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Invalid destination URL';
  END IF;

  IF NOT (coalesce(p_tags, '{}') <@ allowed_tags) THEN
    RAISE EXCEPTION 'Invalid tag selection';
  END IF;

  IF char_length(coalesce(p_specifications, '')) > 5000 THEN
    RAISE EXCEPTION 'Specifications are too long';
  END IF;

  IF p_campaign_id IS NOT NULL THEN
    UPDATE public.campaigns
    SET name = trim(p_name),
        platform = p_platform,
        incentive_amount = p_incentive,
        campaign_link = p_link,
        tags = coalesce(p_tags, '{}'),
        specifications = coalesce(p_specifications, ''),
        updated_at = now()
    WHERE id = p_campaign_id
    RETURNING * INTO result;
  ELSE
    INSERT INTO public.campaigns (name, platform, incentive_amount, campaign_link, tags, specifications, created_by)
    VALUES (trim(p_name), p_platform, p_incentive, p_link, coalesce(p_tags, '{}'), coalesce(p_specifications, ''), auth.uid())
    RETURNING * INTO result;
  END IF;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_campaign(text, text, integer, text, uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_campaign(text, text, integer, text, uuid, text[], text) TO authenticated;
