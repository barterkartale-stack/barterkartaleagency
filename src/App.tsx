import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { GoogleAccessPanel, OnboardingPanel, StealthLoginPanel, EmailAccessPanel, SignUpPanel, ForgotPasswordPanel, type PartnerRole } from '@/components/AuthPanels';
import { OrderSearch, matchesOrder } from '@/components/OrderSearch';
import { SuperAdmin } from '@/components/SuperAdmin';
import { HelpCenter } from '@/components/HelpCenter';
import {
  ArrowRight, BadgeCheck, BriefcaseBusiness, Check, ChevronDown, CircleHelp,
  Clock3, FileCheck2, IndianRupee, Layers3, LayoutDashboard, LockKeyhole, LogOut,
  Menu, PackageCheck, RotateCcw, ShieldCheck, Sparkles, Star, Target, TrendingUp,
  Search, Upload, Users, WalletCards, X, Zap
} from 'lucide-react';

type View = 'home' | 'campaigns' | 'about' | 'careers' | 'dashboard' | 'console' | 'superadmin';
type CampaignCategory = 'All' | 'Electronics' | 'Home' | 'Beauty';
type Order = { name: string; address: string; platform: string; deal: string; orderId: string; status: string };

const logo = '/assets/images/1003464620.png';
const retearnLogo = '/assets/images/1003502591.png';

const campaigns = [
  { brand: 'Bolt Evo', product: 'Evo Air Pro', category: 'Electronics', type: 'Full Sponsorship', value: '₹3,999', reward: 'Keep the product', color: 'mint' },
  { brand: 'Orient', product: 'Aeroquiet 1200mm Fan', category: 'Home', type: 'Micro-Fee', value: '₹2,499', reward: '₹250 cashback', color: 'sky' },
  { brand: 'Luma Skin', product: 'Barrier Repair Set', category: 'Beauty', type: 'Full Sponsorship', value: '₹1,899', reward: 'Keep the product', color: 'peach' },
  { brand: 'Sonic', product: 'Flow ANC Headphones', category: 'Electronics', type: 'Micro-Fee', value: '₹4,499', reward: '₹400 cashback', color: 'lime' },
];

const feed = [
  { icon: 'E', title: 'Bolt Evo earbuds', meta: 'Amazon · New Delhi', earning: '₹320', time: 'Just now' },
  { icon: 'O', title: 'Orient tower cooler', meta: 'Flipkart · Pune', earning: '₹400', time: '8 min ago' },
  { icon: 'L', title: 'Luma skincare set', meta: 'Myntra · Bengaluru', earning: '₹280', time: '21 min ago' },
];

function App() {
  const [view, setView] = useState<View>(() => window.location.pathname === '/partner-console' ? 'console' : window.location.pathname === '/dashboard' ? 'dashboard' : window.location.pathname === '/super-admin' ? 'superadmin' : 'home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState<CampaignCategory>('All');
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null; role: PartnerRole; onboarding_complete: boolean } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadSession = async (): Promise<void> => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session);
      setAuthLoading(false);
    };
    void loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      (async () => {
        if (!mounted) return;
        setSession(nextSession);
        if (nextSession) await loadProfile(nextSession);
        else { setProfile(null); setOnboarding(false); }
        setAuthLoading(false);
      })();
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session) return;
    const loadOrders = async (): Promise<void> => {
      const { data } = await supabase.from('campaign_enrollments').select('name, delivery_address, platform, campaign_type, tracking_order_id, status').order('created_at', { ascending: false });
      if (data) setOrders(data.map((item) => ({ name: item.name, address: item.delivery_address, platform: item.platform, deal: item.campaign_type, orderId: item.tracking_order_id, status: item.status })));
    };
    void loadOrders();
  }, [session]);

  const loadProfile = async (activeSession: Session): Promise<void> => {
    const { data } = await supabase.from('profiles').select('display_name, role, onboarding_complete').eq('id', activeSession.user.id).maybeSingle();
    setProfile(data as { display_name: string | null; role: PartnerRole; onboarding_complete: boolean } | null);
    if (!data || !data.onboarding_complete) {
      setOnboarding(true);
    } else {
      setOnboarding(false);
      if (window.location.pathname === '/dashboard') setView('dashboard');
      if (window.location.pathname === '/super-admin') setView('superadmin');
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const goTo = (next: View) => {
    const route = next === 'dashboard' ? '/dashboard' : next === 'console' ? '/partner-console' : next === 'superadmin' ? '/super-admin' : '/';
    window.history.pushState({}, '', route);
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openGoogle = () => {
    setGoogleOpen(true);
    setMenuOpen(false);
  };

  const openConsole = () => {
    setConsoleOpen(true);
    setMenuOpen(false);
  };

  const onStealthLogin = (role: PartnerRole, displayName: string | null): void => {
    setProfile({ display_name: displayName, role, onboarding_complete: true });
    setConsoleOpen(false);
    setView('console');
    setToast('Secure operations console unlocked.');
  };

  const handleSignOut = async (): Promise<void> => {
    await supabase.auth.signOut();
    setProfile(null);
    setOnboarding(false);
    setOrders([]);
    setView('home');
    window.history.pushState({}, '', '/');
    setToast('You have been signed out.');
  };

  const completeOnboarding = async (): Promise<void> => {
    setOnboarding(false);
    if (session) await loadProfile(session);
    setView('dashboard');
    setToast('Your partner profile is ready.');
  };

  const submitOrder = async (order: Order): Promise<void> => {
    if (!session) {
      setGoogleOpen(true);
      return;
    }
    const { error } = await supabase.from('campaign_enrollments').insert({ name: order.name, delivery_address: order.address, platform: order.platform, campaign_type: order.deal, tracking_order_id: order.orderId });
    if (error) {
      setToast('We could not save this enrollment. Please try again.');
      return;
    }
    setOrders((current) => [{ ...order, status: 'received' }, ...current]);
    setToast('Order form submitted. Your campaign brief is ready.');
  };

  const submitRefund = async (refund: { enrollmentId: string | null; name: string; platform: string; campaignType: string; upiId: string; proofFilename: string | null }): Promise<void> => {
    if (!session) {
      setGoogleOpen(true);
      return;
    }
    const { error } = await supabase.from('refunds').insert({
      enrollment_id: refund.enrollmentId,
      name: refund.name,
      platform: refund.platform,
      campaign_type: refund.campaignType,
      upi_id: refund.upiId,
      proof_filename: refund.proofFilename,
    });
    if (error) {
      setToast('We could not save this refund submission. Please try again.');
      return;
    }
    setToast('Refund form submitted. Your verification is in review.');
  };

  if (authLoading) return <div className="auth-loading"><img src={logo} alt="BarterKartale" /><span>Securing your partner session…</span></div>;

  const onDashboard = session && profile && profile.onboarding_complete;

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => goTo('home')} aria-label="Go to BarterKartale home">
          <img src={logo} alt="BarterKartale" />
          <span><b>Barter</b>Kartale</span>
        </button>
        <nav className={menuOpen ? 'main-nav open' : 'main-nav'}>
          {(['home', 'campaigns', 'about', 'careers'] as View[]).map((item) => (
            <button key={item} className={view === item ? 'nav-link active' : 'nav-link'} onClick={() => goTo(item)}>
              {item === 'home' ? 'Home' : item === 'campaigns' ? 'Active Campaigns' : item === 'about' ? 'About Us' : 'Careers'}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <span className="status-dot"><i /> accepting partners</span>
          {onDashboard ? (
            <>
              <button className="sign-in-button" onClick={() => goTo('dashboard')}><LayoutDashboard size={15} /> Dashboard</button>
              <button className="sign-out-button" onClick={handleSignOut}><LogOut size={15} /> Sign Out</button>
            </>
          ) : (
            <button className="sign-in-button" onClick={openGoogle}><LockKeyhole size={15} /> Sign In</button>
          )}
          <button className="console-button" onClick={openConsole}><LockKeyhole size={15} /> Partner Console</button>
          <button className="menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle navigation">{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </header>

      <main>
        {view === 'home' && <Home onExplore={() => goTo('campaigns')} onStart={() => goTo('campaigns')} onGoogle={openGoogle} onConsole={openConsole} />}
        {view === 'campaigns' && <Campaigns category={category} setCategory={setCategory} onBook={() => goTo('home')} />}
        {view === 'about' && <About />}
        {view === 'careers' && <Careers onSubmit={() => setToast('Application saved. Our team will review your profile shortly.')} />}
        {view === 'dashboard' && onDashboard && <PublicDashboard orders={orders} onOrder={submitOrder} onRefund={submitRefund} onSignOut={handleSignOut} displayName={profile!.display_name || session!.user.email || 'Partner'} />}
        {view === 'console' && profile && <PartnerConsole orders={orders} onOrder={submitOrder} onRefund={submitRefund} onSignOut={handleSignOut} role={profile.role} />}
        {view === 'superadmin' && profile && profile.role === 'Super_Admin' && <SuperAdmin onSignOut={handleSignOut} displayName={profile.display_name || session!.user.email || 'Admin'} />}
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><img src={logo} alt="" /><span>BarterKartale</span></div>
        <p>Real products. Clear rules. Better partnerships.</p>
        <div className="footer-note"><ShieldCheck size={15} /> Built around transparent creator commerce</div>
      </footer>

      {googleOpen && <AuthModal onClose={() => setGoogleOpen(false)} onError={(message) => setToast(message)} />}
      {consoleOpen && <StealthModal onClose={() => setConsoleOpen(false)} onSuccess={onStealthLogin} onError={(message) => setToast(message)} />}
      {onboarding && session && <OnboardingModal session={session} onComplete={completeOnboarding} onError={(message) => setToast(message)} />}
      {toast && <div className="toast"><BadgeCheck size={18} /><span>{toast}</span><button onClick={() => setToast('')}><X size={15} /></button></div>}
      <HelpCenter />
    </div>
  );
}

function Home({ onExplore, onStart, onGoogle, onConsole }: { onExplore: () => void; onStart: () => void; onGoogle: () => void; onConsole: () => void }) {
  return <>
    <section className="hero section-wrap">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-line" /> CREATOR COMMERCE, REIMAGINED</div>
        <h1>India's premier <em>influencer collaboration</em> & brand promotion network.</h1>
        <p className="hero-lede">We partner with top-tier brands across Amazon, Flipkart, Myntra, and Meesho. Discover product sponsorships and beta-testing campaigns with zero followers required.</p>
        <div className="hero-actions"><button className="primary-button" onClick={onExplore}>Explore campaigns <ArrowRight size={17} /></button><button className="text-button" onClick={onGoogle}>Continue with Google <ChevronDown size={16} /></button></div>
        <div className="trust-row"><div className="avatars"><span>AK</span><span>NS</span><span>RM</span><span>+</span></div><div><div className="stars"><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /></div><strong>Trusted by 2,400+ partners</strong></div></div>
      </div>
      <div className="hero-visual">
        <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
        <div className="hero-card main-product"><div className="product-top"><span>LIVE DROP · 04</span><span className="green-pill">OPEN</span></div><div className="earbuds"><span /><span /></div><p>Bolt Evo Air Pro</p><strong>₹3,999 value</strong><small>Full sponsorship campaign</small><div className="card-progress"><i /></div><div className="card-footer"><span>42 slots left</span><span>Ends in 2d 08h</span></div></div>
        <div className="floating-stat stat-one"><span className="icon-box mint"><TrendingUp size={17} /></span><div><small>Partner earnings</small><strong>₹18,420</strong></div><span className="up-label">+24%</span></div>
        <div className="floating-stat stat-two"><span className="icon-box dark"><PackageCheck size={17} /></span><div><small>Products delivered</small><strong>1,284</strong></div></div>
        <div className="micro-label label-one">01 <span>DISCOVER</span></div><div className="micro-label label-two">02 <span>COLLABORATE</span></div>
      </div>
    </section>
    <section className="marquee-band"><div className="marquee-track">{['BOLT EVO', 'ORIENT', 'LUMA SKIN', 'SONIC', 'NOVA HOME', 'BOLT EVO', 'ORIENT', 'LUMA SKIN', 'SONIC', 'NOVA HOME'].map((brand, index) => <span key={`${brand}-${index}`}><i /> {brand}</span>)}</div></section>
    <section className="section-wrap intro-section"><div className="section-kicker">WHY BARTERKARTALE</div><div className="intro-grid"><h2>Where brands meet<br /><em>the next voice.</em></h2><div><p>We make product collaborations feel less like paperwork and more like progress. Browse curated campaigns, follow clear verification steps, and build a track record brands can trust.</p><button className="underlined-link" onClick={onStart}>See how it works <ArrowRight size={16} /></button></div></div><div className="feature-row"><Feature icon={<Target />} number="01" title="Curated campaigns" text="Thoughtful product drops matched to real communities." /><Feature icon={<FileCheck2 />} number="02" title="Clear verification" text="Simple steps, transparent timelines, no hidden surprises." /><Feature icon={<WalletCards />} number="03" title="Fair outcomes" text="Keep products or earn responsibly through approved campaigns." /></div></section>
    <section className="dark-preview"><div className="section-wrap preview-grid"><div><div className="eyebrow light"><span className="eyebrow-line" /> THE RET-EARN MODEL</div><h2>Beta testing<br />built on <em>trust.</em></h2><p>For approved partners, Ret-Earn makes milestone verification easier to understand: complete the agreed brief, upload authentic proof, and get reviewed on a clear timeline.</p><button className="outline-light" onClick={onConsole}>Enter Partner Console <ArrowRight size={16} /></button></div><div className="retearn-card"><div className="retearn-heading"><img src={retearnLogo} alt="Ret-Earn" /><span>PARTNER VIEW</span></div><div className="earn-amount"><small>AVAILABLE THIS WEEK</small><strong>₹12,840</strong><span><TrendingUp size={14} /> 18.6% from last week</span></div><div className="mini-chart"><i /><i /><i /><i /><i /><i /><i /></div><div className="retearn-footer"><span><span className="live-dot" /> 3 live tasks</span><span>Updated moments ago</span></div></div></div></section>
    <section className="section-wrap campaign-preview"><div className="section-heading"><div><div className="section-kicker">OPEN NOW</div><h2>Find your next <em>collab.</em></h2></div><button className="underlined-link" onClick={onExplore}>View all campaigns <ArrowRight size={16} /></button></div><div className="campaign-grid">{campaigns.slice(0, 3).map((campaign) => <CampaignCard key={campaign.product} campaign={campaign} />)}</div></section>
  </>;
}

function Feature({ icon, number, title, text }: { icon: React.ReactNode; number: string; title: string; text: string }) { return <div className="feature"><div className="feature-icon">{icon}</div><span className="feature-number">{number}</span><h3>{title}</h3><p>{text}</p></div>; }

function CampaignCard({ campaign }: { campaign: typeof campaigns[number] }) { return <article className={`campaign-card ${campaign.color}`}><div className="campaign-image"><div className="image-orb" /><span className="campaign-tag">{campaign.type}</span><span className="brand-mark">{campaign.brand.slice(0, 1)}</span></div><div className="campaign-details"><div className="campaign-meta"><span>{campaign.category}</span><span>{campaign.value} value</span></div><h3>{campaign.product}</h3><div className="campaign-reward"><span>Partner outcome</span><strong>{campaign.reward}</strong></div><button className="card-link">View campaign <ArrowRight size={15} /></button></div></article>; }

function Campaigns({ category, setCategory, onBook }: { category: CampaignCategory; setCategory: (category: CampaignCategory) => void; onBook: () => void }) { const filtered = category === 'All' ? campaigns : campaigns.filter((item) => item.category === category); return <section className="section-wrap page-section"><div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> ACTIVE CAMPAIGNS</div><h1>Choose a brief that<br /><em>fits your world.</em></h1></div><p>Every drop has a clear brief, a real product, and a transparent path from order to verification.</p></div><div className="filter-bar"><div>{(['All', 'Electronics', 'Home', 'Beauty'] as CampaignCategory[]).map((item) => <button className={category === item ? 'filter active' : 'filter'} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><span><span className="live-dot" /> {filtered.length} campaigns available</span></div><div className="campaign-grid full">{filtered.map((campaign) => <div key={campaign.product} onClick={onBook}><CampaignCard campaign={campaign} /></div>)}</div><div className="responsible-note"><ShieldCheck size={20} /><div><strong>Responsible collaboration, always.</strong><p>Campaigns are based on authentic experiences and approved briefs. No paid fake reviews, manipulated ratings, or off-platform pressure.</p></div></div></section>; }

function About() { return <section className="section-wrap page-section about-page"><div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> OUR POINT OF VIEW</div><h1>Better commerce<br /><em>starts with clarity.</em></h1></div><p>BarterKartale sits between brands and communities, making product discovery more human and creator work more sustainable.</p></div><div className="about-hero"><div className="about-number">02 <span>/ 04</span></div><div><h2>Not just another<br />campaign marketplace.</h2><p>We care about the details that make partnerships last: honest product feedback, respectful timelines, and payouts that arrive when the work is genuinely complete.</p></div><div className="about-stamp"><Sparkles size={25} /><span>MADE FOR<br /><b>REAL PEOPLE</b></span></div></div><div className="values-grid"><div><span>01</span><h3>Human first</h3><p>We build around how people actually discover, test, and talk about products.</p></div><div><span>02</span><h3>Built for trust</h3><p>Clear briefs and transparent review checkpoints protect every side of the collaboration.</p></div><div><span>03</span><h3>Always evolving</h3><p>From campus communities to digital creators, we keep opening new doors to opportunity.</p></div></div></section>; }

function Careers({ onSubmit }: { onSubmit: () => void }) { const [submitted, setSubmitted] = useState(false); const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubmitted(true); onSubmit(); }; return <section className="section-wrap page-section careers-page"><div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> COME BUILD WITH US</div><h1>Make product discovery<br /><em>more human.</em></h1></div><p>We're growing a thoughtful, curious team across campuses, creator communities, and brand partnerships.</p></div><div className="career-grid"><div className="role-list"><Role icon={<Users />} title="Campus Ambassadors" text="Build a trusted local circle and earn from the communities you grow." tag="Community" /><Role icon={<Zap />} title="Verified Digital Product Testers" text="Bring your eye for detail to product stories that feel genuinely useful." tag="Creator" /><Role icon={<FileCheck2 />} title="Assistant Coordinator" text="Audit local networks and verify task media assets, including rating screen-recordings and proof uploads, against approved campaign briefs." tag="Operations" /><Role icon={<BriefcaseBusiness />} title="Ground Managers" text="Help campaigns run smoothly from first brief to final verification." tag="Leadership" /></div><form className="application-card" onSubmit={handleSubmit}><div className="section-kicker">YOUR NEXT CHAPTER</div><h2>Tell us a little<br /><em>about yourself.</em></h2>{submitted ? <div className="success-panel"><BadgeCheck size={30} /><strong>Application received</strong><p>We'll be in touch if there's a fit for the next cohort.</p></div> : <><label>Full name<input required placeholder="Your name" /></label><label>Phone or email<input required placeholder="How can we reach you?" /></label><label>Which role feels right? <select defaultValue=""><option value="" disabled>Select a role</option><option>Campus Ambassador</option><option>Verified Digital Product Tester</option><option>Assistant Coordinator</option><option>Ground Manager</option></select></label><button className="primary-button" type="submit">Send application <ArrowRight size={16} /></button></>}</form></div><div className="zero-tolerance"><ShieldCheck size={22} /><div><strong>Trust is non-negotiable.</strong><p>Authentic submissions only. Misleading screenshots, altered timelines, seller manipulation, or fabricated experiences are not part of our community and can lead to permanent removal.</p></div></div></section>; }

function Role({ icon, title, text, tag }: { icon: React.ReactNode; title: string; text: string; tag: string }) { return <div className="role-row"><div className="role-icon">{icon}</div><div><span>{tag}</span><h3>{title}</h3><p>{text}</p></div><ArrowRight size={19} /></div>; }

function AuthModal({ onClose, onError }: { onClose: () => void; onError: (message: string) => void }) {
  const [mode, setMode] = useState<'gateway' | 'forgot'>('gateway');
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');

  if (mode === 'forgot') {
    return <div className="modal-backdrop" onMouseDown={onClose}><div className="login-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18} /></button><ForgotPasswordPanel onClose={() => setMode('gateway')} onError={onError} /></div></div>;
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="login-modal access-gateway" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18} /></button><div className="section-kicker">ACCESS GATEWAY</div><h2>Welcome to<br /><em>BarterKartale.</em></h2><p>Sign in to your dashboard or create a new partner account.</p><GoogleAccessPanel onError={onError} /><div className="auth-separator"><span>— Or use your credentials —</span></div><div className="auth-tabs"><button className={authTab === 'signin' ? 'auth-tab active' : 'auth-tab'} onClick={() => setAuthTab('signin')}>Sign In</button><button className={authTab === 'signup' ? 'auth-tab active' : 'auth-tab'} onClick={() => setAuthTab('signup')}>Sign Up</button></div>{authTab === 'signin' ? <EmailAccessPanel onSuccess={onClose} onError={onError} onForgotPassword={() => setMode('forgot')} /> : <SignUpPanel onSuccess={onClose} onError={onError} />}</div></div>;
}

function StealthModal({ onClose, onSuccess, onError }: { onClose: () => void; onSuccess: (role: PartnerRole, displayName: string | null) => void; onError: (message: string) => void }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="login-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18} /></button><StealthLoginPanel onSuccess={onSuccess} onError={onError} /></div></div>; }

function OnboardingModal({ session, onComplete, onError }: { session: Session; onComplete: () => void; onError: (message: string) => void }) { return <div className="modal-backdrop onboarding-backdrop"><OnboardingPanel email={session.user.email || 'your Google account'} onComplete={onComplete} onError={onError} /></div>; }

function PublicDashboard({ orders, onOrder, onRefund, onSignOut, displayName }: { orders: Order[]; onOrder: (order: Order) => Promise<void>; onRefund: (refund: RefundData) => Promise<void>; onSignOut: () => void; displayName: string }) { const [showOrder, setShowOrder] = useState(false); const [refundOrderId, setRefundOrderId] = useState<string | null>(null); const [query, setQuery] = useState(''); const visibleOrders = orders.filter((order) => matchesOrder(order, query)); return <section className="section-wrap console-page"><div className="console-top"><div><div className="eyebrow"><span className="eyebrow-line" /> PUBLIC INFLUENCER DASHBOARD</div><h1>Welcome, <em>{displayName.split(' ')[0]}.</em></h1><p>Your sponsorship campaigns and partner network, in one focused view.</p></div><div className="console-user"><span className="user-avatar">{displayName.slice(0, 2).toUpperCase()}</span><div><strong>{displayName}</strong><small>Google-verified partner <BadgeCheck size={13} /></small></div></div></div><div className="console-tabs"><button className="active"><Layers3 size={16} /> BarterKartale Log</button><button><Users size={16} /> My Affiliate Net</button></div><div className="dashboard-search"><OrderSearch orders={orders} onSearch={setQuery} /></div><div className="public-dashboard-grid"><BarterLog orders={visibleOrders} hasOrders={orders.length > 0} onOrder={() => setShowOrder(true)} onRefund={(orderId) => setRefundOrderId(orderId)} /><Network /></div><div className="whatsapp-cta"><a className="whatsapp-link" href="https://chat.whatsapp.com/HEaCIH60fQ9GrgbxWYWizh" target="_blank" rel="noopener noreferrer">Join WhatsApp Group <ArrowRight size={16} /></a></div><div className="dashboard-actions"><button className="sign-out-button" onClick={onSignOut}><LogOut size={15} /> Sign out of dashboard</button></div>{showOrder && <OrderModal onClose={() => setShowOrder(false)} onSubmit={async (order) => { await onOrder(order); setShowOrder(false); }} />}{refundOrderId !== null && <RefundModal orders={orders} initialOrderId={refundOrderId} onClose={() => setRefundOrderId(null)} onSubmit={async (refund) => { await onRefund(refund); setRefundOrderId(null); }} />}</section>; }

function PartnerConsole({ orders, onOrder, onRefund, onSignOut, role }: { orders: Order[]; onOrder: (order: Order) => Promise<void>; onRefund: (refund: RefundData) => Promise<void>; onSignOut: () => void; role: PartnerRole }) { const [tab, setTab] = useState<'ret' | 'network' | 'control'>('ret'); const [showOrder, setShowOrder] = useState(false); const [showRefund, setShowRefund] = useState(false); const isManager = role === 'Ground_Manager'; return <section className="section-wrap console-page"><div className="console-top"><div><div className="eyebrow"><span className="eyebrow-line" /> STEALTH OPERATIONS PORTAL</div><h1>Ret-Earn, <em>in control.</em></h1><p>Private workspace for approved beta-testing operations and task verification.</p></div><div className="console-user"><span className="user-avatar">OP</span><div><strong>{role.replace('_', ' ')}</strong><small>Assigned operations role <BadgeCheck size={13} /></small></div><ChevronDown size={16} /></div></div><div className="metric-grid"><Metric icon={<IndianRupee />} label="This month" value="₹4,860" change="+18.4%" /><Metric icon={<PackageCheck />} label="Completed tasks" value="12" change="+3 this week" /><Metric icon={<Clock3 />} label="In review" value="02" change="Usually under 24h" /><Metric icon={<Users />} label="Active network" value="18" change="₹900 earned" /></div><div className="console-tabs"><button className={tab === 'ret' ? 'active' : ''} onClick={() => setTab('ret')}><RotateCcw size={16} /> Ret-Earn Live Feed</button><button className={tab === 'network' ? 'active' : ''} onClick={() => setTab('network')}><Users size={16} /> Verification Network</button>{isManager && <button className={tab === 'control' ? 'active' : ''} onClick={() => setTab('control')}><ShieldCheck size={16} /> Master Control Center</button>}</div>{tab === 'ret' && <RetEarnFeed onRefund={() => setShowRefund(true)} />} {tab === 'network' && <Network />}{tab === 'control' && isManager && <ManagerCenter />}<div className="dashboard-actions"><button className="sign-out-button" onClick={onSignOut}><LogOut size={15} /> Exit stealth console</button></div>{showOrder && <OrderModal onClose={() => setShowOrder(false)} onSubmit={async (order) => { await onOrder(order); setShowOrder(false); }} />} {showRefund && <RefundModal orders={orders} initialOrderId={orders[0]?.orderId ?? null} onClose={() => setShowRefund(false)} onSubmit={async (refund) => { await onRefund(refund); setShowRefund(false); }} />}</section>; }

function ManagerCenter() { return <div className="manager-center"><div className="manager-grid"><div className="manager-card manager-profit"><div className="section-kicker">GROUND MANAGER · EKANSH</div><h2>30% net profit<br /><em>dividends.</em></h2><div className="profit-value">₹28,640 <span>this cycle</span></div><div className="profit-bars"><i /><i /><i /><i /><i /><i /><i /></div><div className="manager-card-foot"><span>+12.8% from last cycle</span><span>7 active weeks</span></div></div><div className="manager-card"><div className="section-kicker">TASK VERIFICATION</div><h3>Operational switches</h3><div className="switch-row"><span>Media review queue</span><b className="switch on" /></div><div className="switch-row"><span>Assistant Coordinator audit</span><b className="switch on" /></div><div className="switch-row"><span>New task approvals</span><b className="switch" /></div></div></div><div className="manager-list"><div className="panel-heading"><div><span className="section-kicker">SUB-USER TRACKING</span><h2>Active operations list.</h2></div><span className="live-badge"><i /> 18 ACTIVE</span></div><div className="manager-table"><div className="table-head"><span>PARTNER</span><span>ROLE</span><span>MEDIA STATUS</span><span>LAST ACTIVE</span></div>{[['Neha S.', 'Reviewer', 'Verified', '2m ago'], ['Rohan M.', 'Assistant Coordinator', 'In review', '8m ago'], ['Priya K.', 'Reviewer', 'Awaiting proof', '21m ago'], ['Arjun T.', 'Reviewer', 'Verified', '34m ago']].map(([name, role, status, active]) => <div className="table-row" key={name}><strong>{name}</strong><span>{role}</span><span className={status === 'Verified' ? 'table-status verified' : 'table-status'}><i /> {status}</span><span>{active}</span></div>)}</div></div></div>; }

function Metric({ icon, label, value, change }: { icon: React.ReactNode; label: string; value: string; change: string }) { return <div className="metric-card"><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{change}</small></div>; }
function RetEarnFeed({ onRefund }: { onRefund: () => void }) { return <div className="feed-layout"><div className="feed-card"><div className="panel-heading"><div><span className="section-kicker">AVAILABLE NOW</span><h2>Return tasks for you.</h2></div><span className="live-badge"><i /> LIVE</span></div><p className="panel-subtitle">Complete an approved beta-testing brief, share authentic product feedback, and submit your verification when the milestone is complete.</p><div className="task-list">{feed.map((task) => <div className="task-row" key={task.title}><div className="task-brand">{task.icon}</div><div className="task-copy"><strong>{task.title}</strong><span>{task.meta}</span></div><div className="task-earning"><strong>{task.earning}</strong><span>{task.time}</span></div><button className="icon-button"><ArrowRight size={16} /></button></div>)}</div><div className="rotation-note"><CircleHelp size={18} /><div><strong>Keep your workflow balanced</strong><p>Follow each campaign's platform and delivery instructions. One clear task at a time keeps your account healthy.</p></div></div></div><div className="verification-card"><div className="section-kicker">NEXT STEP</div><div className="verify-icon"><FileCheck2 size={22} /></div><h3>Have you completed a task?</h3><p>Submit your campaign details and authentic proof for a quick human review.</p><button className="primary-button" onClick={onRefund}>Fill Refund Form <ArrowRight size={15} /></button><small><ShieldCheck size={13} /> Reviews are handled responsibly</small></div></div>; }
function BarterLog({ orders, hasOrders, onOrder, onRefund }: { orders: Order[]; hasOrders: boolean; onOrder: () => void; onRefund: (orderId: string) => void }) { return <div className="barter-log"><div className="panel-heading"><div><span className="section-kicker">YOUR PRODUCT LOG</span><h2>Keep, share, or resell.</h2></div><button className="primary-button" onClick={onOrder}>Fill Order Form <ArrowRight size={15} /></button></div><p className="panel-subtitle">A simple record of your active product collaborations and personal-use campaigns.</p>{!hasOrders ? <div className="empty-state"><PackageCheck size={30} /><strong>Your product log is empty</strong><p>Fill your first order form to see it here.</p></div> : orders.length === 0 ? <div className="empty-state"><Search size={30} /><strong>No matching orders</strong><p>Try another order ID, name, platform, or deal.</p></div> : <div className="order-table">{orders.map((order) => <div className="order-row" key={order.orderId}><div><strong>{order.orderId}</strong><span>{order.platform} · {order.deal}</span></div><div className="order-actions"><span className="status-chip"><Check size={13} /> {order.status}</span><button className="link-chip" onClick={() => onRefund(order.orderId)}>Fill Refund Form</button></div></div>)}</div>}</div>; }
function Network() { return <div className="network-card"><div className="panel-heading"><div><span className="section-kicker">REFERRALS & REWARDS</span><h2>Grow your circle, responsibly.</h2></div><div className="milestone"><small>MEGA MILESTONE</small><strong>6 / 10 friends</strong><div><i /></div><span>₹300 unlocked</span></div></div><div className="network-stats"><div><span>Referral bonus</span><strong>₹50 <small>per active friend</small></strong></div><div><span>Priority pass</span><strong>10 min <small>early access</small></strong></div><div><span>Network status</span><strong className="green-text">Healthy</strong></div></div><div className="referral-table"><div className="table-head"><span>FRIEND</span><span>GROUP</span><span>STATUS</span><span>BONUS</span></div>{[['Neha S.', 'Ret-Earn', 'Verified', '₹50'], ['Rohan M.', 'BarterKartale', 'Verified', '₹50'], ['Priya K.', 'Ret-Earn', 'In progress', '—'], ['Arjun T.', 'BarterKartale', 'Verified', '₹50']].map(([name, group, status, bonus]) => <div className="table-row" key={name}><strong>{name}</strong><span>{group}</span><span className={status === 'Verified' ? 'table-status verified' : 'table-status'}><i /> {status}</span><b>{bonus}</b></div>)}</div></div>; }

function OrderModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (order: Order) => void }) { const [form, setForm] = useState<Order>({ name: '', address: '', platform: 'Amazon', deal: 'Full Sponsorship', orderId: '', status: '' }); const update = (key: keyof Order, value: string) => setForm((current) => ({ ...current, [key]: value })); return <div className="modal-backdrop" onMouseDown={onClose}><div className="form-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18} /></button><div className="section-kicker">ORDER FORM</div><h2>Fill Order <em>form.</em></h2><p>Share the basics so we can match your order to the right campaign brief.</p><div className="form-grid"><label>Your name<input value={form.name} onChange={(e) => update('name', e.target.value)} required placeholder="Full name" /></label><label>Order ID<input value={form.orderId} onChange={(e) => update('orderId', e.target.value)} required placeholder="e.g. 405-1234567" /></label><label className="wide">Campus or delivery address<input value={form.address} onChange={(e) => update('address', e.target.value)} required placeholder="Where should the product go?" /></label><label>Platform<select value={form.platform} onChange={(e) => update('platform', e.target.value)}><option>Amazon</option><option>Flipkart</option><option>Myntra</option><option>Meesho</option></select></label><label>Deal type<select value={form.deal} onChange={(e) => update('deal', e.target.value)}><option>Full Sponsorship</option><option>Micro-Fee Campaign</option></select></label></div><button className="primary-button full-button" onClick={() => onSubmit(form)}>Submit order form <ArrowRight size={16} /></button><small className="form-footnote"><ShieldCheck size={13} /> Your details stay within this partner workspace.</small></div></div>; }
const PLATFORMS = ['Amazon', 'Flipkart', 'Myntra', 'Meesho'];
const DEALS = ['Full Sponsorship', 'Micro-Fee Campaign'];

type RefundField = 'name' | 'platform' | 'deal';
type RefundData = { enrollmentId: string | null; name: string; platform: string; campaignType: string; upiId: string; proofFilename: string | null };

function RefundModal({ orders, initialOrderId, onClose, onSubmit }: { orders: Order[]; initialOrderId: string | null; onClose: () => void; onSubmit: (refund: RefundData) => void }) {
  const [selectedId, setSelectedId] = useState(initialOrderId ?? orders[0]?.orderId ?? '');
  const [overrides, setOverrides] = useState<Partial<Record<RefundField, string>>>({});
  const [upi, setUpi] = useState('');
  const [file, setFile] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const selected = orders.find((order) => order.orderId === selectedId);
  const valueOf = (field: RefundField) => overrides[field] ?? selected?.[field] ?? '';
  const override = (field: RefundField, value: string) => setOverrides((current) => ({ ...current, [field]: value }));
  const chooseOrder = (orderId: string) => { setSelectedId(orderId); setOverrides({}); };
  const onFile = (event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0]?.name || '');
  const handleSubmit = () => {
    setSubmitting(true);
    onSubmit({
      enrollmentId: selected?.orderId || null,
      name: valueOf('name'),
      platform: valueOf('platform'),
      campaignType: valueOf('deal'),
      upiId: upi.trim(),
      proofFilename: file || null,
    });
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="form-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18} /></button><div className="section-kicker">REFUND FORM</div><h2>Fill Refund <em>form.</em></h2><p>Details from your matching order fill in automatically. Edit any field before you submit.</p>{orders.length === 0 ? <div className="empty-state"><PackageCheck size={30} /><strong>No order form on file</strong><p>Fill an order form first. The refund form uses the details from that order.</p></div> : <><div className="form-grid"><label className="wide">Order ID<select value={selectedId} onChange={(event) => chooseOrder(event.target.value)}>{orders.map((order) => <option key={order.orderId} value={order.orderId}>{order.orderId} · {order.platform}</option>)}</select></label><label>Your name<input value={valueOf('name')} onChange={(event) => override('name', event.target.value)} placeholder="Full name" /></label><label>Platform<select value={valueOf('platform')} onChange={(event) => override('platform', event.target.value)}>{PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}</select></label><label>Deal type<select value={valueOf('deal')} onChange={(event) => override('deal', event.target.value)}>{DEALS.map((deal) => <option key={deal}>{deal}</option>)}</select></label><label>UPI ID for payout<input value={upi} onChange={(event) => setUpi(event.target.value)} placeholder="name@upi" /></label></div><label>Supporting proof<div className="upload-box"><Upload size={20} /><strong>{file || 'Drop your file here'}</strong><span>PNG, JPG or MP4 · max 20MB</span><input type="file" accept="image/png,image/jpeg,video/mp4" onChange={onFile} /></div></label><button className="primary-button full-button" disabled={!upi.trim() || submitting} onClick={handleSubmit}>{submitting ? 'Submitting…' : 'Submit refund form'} <ArrowRight size={16} /></button></>}<small className="form-footnote"><ShieldCheck size={13} /> Only genuine experiences are eligible for payout.</small></div></div>; }

export default App;
