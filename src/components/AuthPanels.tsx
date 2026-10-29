import { useState, type FormEvent } from 'react';
import { ArrowRight, BadgeCheck, LockKeyhole, Mail, ShieldCheck, Fingerprint, MapPin, KeyRound, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export type PartnerRole = 'Reviewer' | 'Assistant_Coordinator' | 'Ground_Manager' | 'Super_Admin';

async function captureSignUpIp(): Promise<string | null> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-ip`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) return null;
    const data = await response.json() as { ip?: string | null };
    return data.ip ?? null;
  } catch {
    return null;
  }
}

function generateDeviceFingerprint(): string {
  try {
    const nav = navigator;
    const screen = window.screen;
    const components = [
      nav.userAgent,
      nav.language,
      nav.languages?.join(',') || '',
      nav.platform,
      String(screen.width),
      String(screen.height),
      String(screen.colorDepth),
      String(nav.hardwareConcurrency || 0),
      String((nav as unknown as { deviceMemory?: number }).deviceMemory || 0),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      String(nav.maxTouchPoints || 0),
    ];
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

export function GoogleAccessPanel({ onError }: { onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);

  const continueWithGoogle = async (): Promise<void> => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
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
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError || !data.user) {
      setLoading(false);
      onError('Could not create your account. This email may already be registered.');
      return;
    }
    const [signUpIp, deviceFingerprint] = await Promise.all([captureSignUpIp(), Promise.resolve(generateDeviceFingerprint())]);
    const { error: rpcError } = await supabase.rpc('complete_partner_onboarding', {
      p_display_name: name,
      p_mobile_number: mobile,
      p_sign_up_ip: signUpIp,
      p_device_fingerprint: deviceFingerprint,
    });
    if (rpcError) {
      setLoading(false);
      onError('Account created but profile setup failed. Please sign in and complete onboarding.');
      return;
    }
    setLoading(false);
    onSuccess();
  };

  return <form className="email-auth-panel" onSubmit={submit}><label>Full Name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" /></label><label>Active WhatsApp Number<input required inputMode="tel" pattern="[0-9+() -]{10,15}" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit WhatsApp number" /></label><label>Email Address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" /></label><label>Create Password<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label><button className="primary-button full-button" disabled={loading}>{loading ? 'Creating account…' : 'Create Account'} <ArrowRight size={16} /></button><div className="privacy-disclosure"><ShieldCheck size={14} /><span>For account security and fraud prevention, your login IP address and a device fingerprint are securely logged when you complete this setup. This data is visible only to authorized administrators and is used solely for account verification.</span></div></form>;
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

export function OnboardingPanel({ email, onComplete, onError }: { email: string; onComplete: () => void; onError: (message: string) => void }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
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
    const [signUpIp, deviceFingerprint] = await Promise.all([captureSignUpIp(), Promise.resolve(generateDeviceFingerprint())]);
    const { error } = await supabase.rpc('complete_partner_onboarding', {
      p_display_name: name,
      p_mobile_number: mobile,
      p_sign_up_ip: signUpIp,
      p_device_fingerprint: deviceFingerprint,
    });
    if (error) {
      setLoading(false);
      onError('We could not finish onboarding. Please check your mobile number and try again.');
      return;
    }
    onComplete();
  };

  return <div className="auth-panel onboarding-panel"><div className="login-mark"><BadgeCheck size={20} /></div><div className="section-kicker">FIRST-TIME PARTNER SETUP</div><h2>One quick step<br /><em>before we begin.</em></h2><p>Your Google account is connected as <strong>{email}</strong>. Add your mobile number and create a secure backup password for your account.</p><form onSubmit={submit}><label>Full name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label><label>Mobile number<input required inputMode="tel" pattern="[0-9+() -]{10,15}" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="10-digit mobile number" /></label><label>Create password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label><button className="primary-button full-button" disabled={loading}>{loading ? 'Saving securely…' : 'Complete setup'} <ArrowRight size={16} /></button></form><div className="privacy-disclosure"><ShieldCheck size={14} /><span>For account security and fraud prevention, your login IP address and a device fingerprint are securely logged when you complete this setup. This data is visible only to authorized administrators and is used solely for account verification.</span></div><small className="form-footnote"><Fingerprint size={13} /> Device ID: <code>{generateDeviceFingerprint().slice(0, 18)}</code> · <MapPin size={13} /> IP captured on submit</small></div>;
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
