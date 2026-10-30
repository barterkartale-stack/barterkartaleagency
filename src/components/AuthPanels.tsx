import { useState, type FormEvent } from 'react';
import { ArrowRight, BadgeCheck, LockKeyhole, Mail, ShieldCheck, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export type PartnerRole = 'Reviewer' | 'Assistant_Coordinator' | 'Ground_Manager' | 'Super_Admin';

function generateDeviceFingerprint(): string {
  try {
    const nav = navigator;
    const screen = window.screen;
    const components = [nav.userAgent, nav.language, nav.languages?.join(',') || '', nav.platform, String(screen.width), String(screen.height), String(screen.colorDepth), String(nav.hardwareConcurrency || 0), String((nav as unknown as { deviceMemory?: number }).deviceMemory || 0), Intl.DateTimeFormat().resolvedOptions().timeZone, String(nav.maxTouchPoints || 0)];
    const raw = components.join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return `fp_${Math.abs(hash).toString(36)}_${raw.length.toString(36)}`;
  } catch {
    return 'fp_unknown';
  }
}

function captureDeviceMetadata(): Record<string, string> {
  return {
    platform: navigator.platform.slice(0, 120),
    language: navigator.language.slice(0, 120),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 120),
    screen: `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
  };
}

export function GoogleAccessPanel({ onError }: { onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);

  const continueWithGoogle = async (): Promise<void> => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: import.meta.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setLoading(false);
      const msg = String(error.message || '');
      if (msg.includes('Unsupported provider') || msg.includes('provider is not enabled') || error.status === 400 || error.status === 403) {
        onError('Google Login is initializing. Please configure Client ID/Secret in Supabase Dashboard or use Email Sign In/Sign Up below.');
      } else {
        onError('Google sign-in is temporarily unavailable. Please try again.');
      }
    }
  };

  return <button className="google-button" onClick={continueWithGoogle} disabled={loading}><span className="google-mark">G</span>{loading ? 'Opening secure sign-in…' : 'Continue with Google'} <ArrowRight size={16} /></button>;
}

export function EmailAccessPanel({ onSuccess, onError, onForgotPassword }: { onSuccess: () => void; onError: (message: string) => void; onForgotPassword: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoading(false);
      onError('Those credentials were not accepted. Check your email and password.');
      return;
    }
    setLoading(false);
    onSuccess();
  };

  return <form className="email-auth-panel" onSubmit={submit}><label>Registered Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" /></label><label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" /></label><button className="primary-button full-button" disabled={loading}>{loading ? 'Signing in…' : 'Sign In'} <ArrowRight size={16} /></button><button type="button" className="text-button forgot-link" onClick={onForgotPassword}><KeyRound size={14} /> Forgot password?</button></form>;
}

export function SignUpPanel({ onSuccess, onError }: { onSuccess: () => void; onError: (message: string) => void }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [securityConsent, setSecurityConsent] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);

  const register = async (): Promise<boolean> => {
    const { data: registration, error } = await supabase.functions.invoke('register-partner', {
      body: {
        displayName: name,
        mobileNumber: mobile,
        invitationCode: invitationCode.trim().toUpperCase(),
        deviceFingerprint: generateDeviceFingerprint(),
        deviceMetadata: captureDeviceMetadata(),
        securityConsent,
      },
    });
    if (error || registration?.error) {
      onError(registration?.error || 'We could not finish registration. Please try again.');
      return false;
    }
    return true;
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    const { data: invitation, error: invitationError } = await supabase.functions.invoke('validate-invitation', {
      body: { invitationCode: invitationCode.trim().toUpperCase() },
    });
    if (invitationError || !invitation?.valid) {
      setLoading(false);
      onError('That invitation code is invalid, expired, or already used.');
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: import.meta.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/auth/callback`,
        data: { display_name: name.trim(), mobile_number: mobile.trim() },
      },
    });
    if (signUpError || !data.user) {
      setLoading(false);
      onError(signUpError?.status === 429 ? 'Too many account requests. Please wait a moment and try again.' : 'We could not create the account. Check your details and try again.');
      return;
    }
    if (!data.session) {
      setLoading(false);
      setAwaitingConfirmation(true);
      return;
    }
    const registered = await register();
    setLoading(false);
    if (registered) onSuccess();
  };

  if (awaitingConfirmation) {
    return <div className="auth-panel"><div className="login-mark"><Mail size={20} /></div><div className="section-kicker">VERIFY YOUR EMAIL</div><h2>One last <em>check.</em></h2><p>We sent a verification link to <strong>{email}</strong>. Open it to activate your account, then return here to complete your security review. Your invitation is checked again when registration is finalized.</p><div className="privacy-disclosure"><ShieldCheck size={14} /><span>Your registration details and invitation code are not used to activate access until you confirm the security disclosure.</span></div></div>;
  }

  return <form className="email-auth-panel" onSubmit={submit}><label>Full Name<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" /></label><label>Active WhatsApp Number<input required inputMode="tel" pattern="[0-9+() -]{10,15}" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="10–15 digits" /></label><label>Email Address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@gmail.com" /></label><label>Create Password<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label><label>Agency invitation code<input required autoCapitalize="characters" autoComplete="off" value={invitationCode} onChange={(event) => setInvitationCode(event.target.value.toUpperCase())} placeholder="BK-…" /></label><label className="security-consent"><input required type="checkbox" checked={securityConsent} onChange={(event) => setSecurityConsent(event.target.checked)} /><span>I consent to use of my WhatsApp number for account contact and collection of my sign-in IP and device details for security review. Security records are restricted to authorized administrators.</span></label><button className="primary-button full-button" disabled={loading}>{loading ? 'Checking invitation…' : 'Create Account'} <ArrowRight size={16} /></button><div className="privacy-disclosure"><ShieldCheck size={14} /><span>New partner accounts are reviewed before access is enabled. Most checks take 2–4 hours.</span></div></form>;
}

export function ForgotPasswordPanel({ onClose, onError }: { onClose: () => void; onError: (message: string) => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/dashboard`,
    });
    setLoading(false);
    if (error) {
      onError('Could not send a reset link. Please try again.');
      return;
    }
    setSent(true);
  };

  if (sent) {
    return <div className="auth-panel"><div className="login-mark"><Mail size={20} /></div><div className="section-kicker">CHECK YOUR INBOX</div><h2>Reset link <em>sent.</em></h2><p>If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly. Click the link in the email to set a new password.</p><button className="primary-button full-button" onClick={onClose}>Back to sign in <ArrowRight size={16} /></button></div>;
  }

  return <div className="auth-panel"><div className="login-mark"><KeyRound size={20} /></div><div className="section-kicker">RESET YOUR PASSWORD</div><h2>Forgot <em>password?</em></h2><p>Enter your registered email and we'll send you a secure link to reset your password.</p><form onSubmit={submit}><label>Email address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" /></label><button className="primary-button full-button" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'} <ArrowRight size={16} /></button></form><button type="button" className="text-button forgot-link" onClick={onClose}><ArrowRight size={14} className="back-arrow" /> Back to sign in</button></div>;
}

export function OnboardingPanel({ email, initialName, initialMobile, onComplete, onError }: { email: string; initialName?: string; initialMobile?: string; onComplete: () => void; onError: (message: string) => void }) {
  const [name, setName] = useState(initialName || '');
  const [mobile, setMobile] = useState(initialMobile || '');
  const [password, setPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [securityConsent, setSecurityConsent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      setLoading(false);
      onError('We could not set your password. Please use at least 8 characters.');
      return;
    }
    const { data, error } = await supabase.functions.invoke('register-partner', {
      body: {
        displayName: name,
        mobileNumber: mobile,
        invitationCode: invitationCode.trim().toUpperCase(),
        deviceFingerprint: generateDeviceFingerprint(),
        deviceMetadata: captureDeviceMetadata(),
        securityConsent,
      },
    });
    if (error || data?.error) {
      setLoading(false);
      onError(data?.error || 'We could not finish registration. Please check your invitation code and try again.');
      return;
    }
    onComplete();
  };

  return <div className="auth-panel onboarding-panel"><div className="login-mark"><BadgeCheck size={20} /></div><div className="section-kicker">PARTNER REGISTRATION</div><h2>One final<br /><em>security check.</em></h2><p>Your Google account is connected as <strong>{email}</strong>. Add your active WhatsApp number, an agency invitation code, and a backup password to continue.</p><form onSubmit={submit}><label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label><label>Active WhatsApp number<input required inputMode="tel" pattern="[0-9+() -]{10,15}" autoComplete="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="10–15 digits" /></label><label>Agency invitation code<input required autoCapitalize="characters" autoComplete="off" value={invitationCode} onChange={(event) => setInvitationCode(event.target.value.toUpperCase())} placeholder="BK-…" /></label><label>Create backup password<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label><label className="security-consent"><input required type="checkbox" checked={securityConsent} onChange={(event) => setSecurityConsent(event.target.checked)} /><span>I consent to collection of my sign-in IP address and device details for account security and fraud prevention. This information is restricted to authorized administrators.</span></label><button className="primary-button full-button" disabled={loading}>{loading ? 'Checking invitation…' : 'Submit for review'} <ArrowRight size={16} /></button></form><div className="privacy-disclosure"><ShieldCheck size={14} /><span>Your registration is not complete until the invitation code is verified and this security disclosure is accepted. Most reviews take 2–4 hours.</span></div></div>;
}

export function StealthLoginPanel({ onSuccess, onError }: { onSuccess: (role: PartnerRole, displayName: string | null) => void; onError: (message: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoading(false);
      onError('Those secure console credentials were not accepted.');
      return;
    }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role, display_name, onboarding_complete, access_status').eq('id', data.user.id).maybeSingle();
    if (profileError || !profile || !['Assistant_Coordinator', 'Ground_Manager', 'Super_Admin'].includes(profile.role)) {
      await supabase.auth.signOut();
      setLoading(false);
      onError('This account is not assigned to the private console.');
      return;
    }
    if (profile.access_status === 'banned' || profile.access_status === 'revoked') {
      await supabase.auth.signOut();
      setLoading(false);
      onError('This account has been suspended. Contact your administrator.');
      return;
    }
    onSuccess(profile.role as PartnerRole, profile.display_name as string | null);
  };

  return <div className="auth-panel"><div className="login-mark"><LockKeyhole size={20} /></div><div className="section-kicker">PRIVATE OPERATIONS</div><h2>Partner<br /><em>Console.</em></h2><p>This route is reserved for pre-allocated operations credentials.</p><form onSubmit={submit}><label>Console email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Assigned email" /></label><label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Assigned password" /></label><button className="primary-button full-button" disabled={loading}>{loading ? 'Verifying…' : 'Enter secure console'} <ArrowRight size={16} /></button></form><small className="form-footnote"><ShieldCheck size={13} /> No public registration is available.</small></div>;
}
