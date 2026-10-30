import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { OrderSearch, matchesOrder } from '@/components/OrderSearch';
import { GoogleFormSettings } from '@/components/GoogleFormSettings';
import {
  ArrowRight, BadgeCheck, Ban, CheckCircle2, Edit3, ExternalLink, IndianRupee,
  LayoutDashboard, Link2, LockKeyhole, LogOut, MapPin, Fingerprint, Plus, Save,
  Search, ShieldCheck, ToggleLeft, ToggleRight, Users, X
} from 'lucide-react';

type Campaign = {
  id: string;
  name: string;
  platform: string;
  incentive_amount: number;
  campaign_link: string;
  tags: string[];
  specifications: string;
  is_active: boolean;
  created_at: string;
};

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  mobile_number: string | null;
  role: string;
  access_status: string;
  sign_up_ip: string | null;
  device_fingerprint: string | null;
  device_metadata?: Record<string, string>;
  registered_at?: string | null;
  security_consent_at?: string | null;
  created_at: string;
};

type BlacklistEntry = { ip_address: string; reason: string; is_active: boolean; created_at: string };

const WHATSAPP_PUBLIC = 'https://chat.whatsapp.com/HEaCIH60fQ9GrgbxWYWizh';
const PLATFORMS = ['Amazon', 'Flipkart', 'Myntra', 'Meesho'];

export function SuperAdmin({ onSignOut, displayName }: { onSignOut: () => void; displayName: string }) {
  const [tab, setTab] = useState<'campaigns' | 'users' | 'integrations'>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async (): Promise<void> => {
    setLoading(true);
    const [campaignResult, userResult, blacklistResult] = await Promise.all([
      supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
      supabase.rpc('list_admin_profiles'),
      supabase.rpc('list_agency_ip_blacklist'),
    ]);
    if (campaignResult.error || userResult.error || blacklistResult.error) {
      setError('Admin records could not be loaded. Confirm your account still has Super Admin access.');
      setLoading(false);
      return;
    }
    if (campaignResult.data) setCampaigns(campaignResult.data as Campaign[]);
    if (userResult.data) setUsers(userResult.data as AdminUser[]);
    if (blacklistResult.data) setBlacklist(blacklistResult.data as BlacklistEntry[]);
    setError('');
    setLoading(false);
  };

  return (
    <section className="section-wrap console-page super-admin-page">
      <div className="console-top">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> SUPER-ADMIN CONTROL CENTER</div>
          <h1>Command <em>center.</em></h1>
          <p>Manage campaigns, monitor user security, and oversee platform operations.</p>
        </div>
        <div className="console-user">
          <span className="user-avatar">SA</span>
          <div><strong>{displayName}</strong><small>Super-Admin access <BadgeCheck size={13} /></small></div>
        </div>
      </div>

      <div className="console-tabs">
        <button className={tab === 'campaigns' ? 'active' : ''} onClick={() => setTab('campaigns')}><LayoutDashboard size={16} /> Campaign Manager</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={16} /> User Management</button>
        <button className={tab === 'integrations' ? 'active' : ''} onClick={() => setTab('integrations')}><Link2 size={16} /> Forms & access</button>
      </div>

      {loading ? (
        <div className="empty-state"><ShieldCheck size={30} /><strong>Loading admin data…</strong></div>
      ) : error ? (
        <div className="empty-state"><X size={30} /><strong>{error}</strong></div>
      ) : tab === 'campaigns' ? (
        <CampaignManager campaigns={campaigns} onRefresh={loadData} />
      ) : tab === 'users' ? (
        <UserTerminal users={users} blacklist={blacklist} onRefresh={loadData} />
      ) : (
        <GoogleFormSettings />
      )}

      <div className="dashboard-actions">
        <button className="sign-out-button" onClick={onSignOut}><LogOut size={15} /> Exit admin panel</button>
      </div>
    </section>
  );
}

function CampaignManager({ campaigns, onRefresh }: { campaigns: Campaign[]; onRefresh: () => Promise<void> }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [query, setQuery] = useState('');
  const visibleCampaigns = campaigns.filter((c) => matchesOrder(
    { orderId: c.name, name: c.name, platform: c.platform, deal: String(c.incentive_amount) },
    query
  ));

  const startEdit = (campaign: Campaign) => { setEditing(campaign); setShowForm(true); };
  const startNew = () => { setEditing(null); setShowForm(true); };

  const toggleActive = async (campaign: Campaign): Promise<void> => {
    await supabase.rpc('toggle_campaign_active', { p_campaign_id: campaign.id, p_is_active: !campaign.is_active });
    await onRefresh();
  };

  return (
    <div className="admin-campaigns">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">CAMPAIGN CREATOR WORKSPACE</span>
          <h2>Manage live campaigns.</h2>
        </div>
        <button className="primary-button" onClick={startNew}><Plus size={16} /> New Campaign</button>
      </div>

      <div className="dashboard-search">
        <OrderSearch
          orders={campaigns.map((c) => ({ orderId: c.name, name: c.name, platform: c.platform, deal: String(c.incentive_amount) }))}
          onSearch={setQuery}
        />
      </div>

      <div className="whatsapp-blocks">
        <a className="whatsapp-block" href={WHATSAPP_PUBLIC} target="_blank" rel="noopener noreferrer">
          <div><span className="section-kicker">BARTERKARTALE PUBLIC</span><strong>Join WhatsApp Community</strong></div>
          <ExternalLink size={18} />
        </a>
      </div>

      {showForm && <CampaignForm editing={editing} onClose={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await onRefresh(); }} />}

      {visibleCampaigns.length === 0 ? (
        <div className="empty-state"><Search size={30} /><strong>No campaigns found</strong><p>Create your first campaign to get started.</p></div>
      ) : (
        <div className="campaign-admin-table">
          <div className="table-head"><span>CAMPAIGN</span><span>PLATFORM</span><span>INCENTIVE</span><span>STATUS</span><span>ACTIONS</span></div>
          {visibleCampaigns.map((campaign) => (
            <div className="table-row admin-campaign-row" key={campaign.id}>
              <strong>{campaign.name}</strong>
              <span>{campaign.platform}</span>
              <span><IndianRupee size={13} />{campaign.incentive_amount.toLocaleString('en-IN')}</span>
              <span className={campaign.is_active ? 'table-status verified' : 'table-status'}><i /> {campaign.is_active ? 'Active' : 'Paused'}</span>
              <div className="row-actions">
                <a className="link-chip" href={campaign.campaign_link} target="_blank" rel="noopener noreferrer">Visit <ExternalLink size={12} /></a>
                <button className="link-chip" onClick={() => startEdit(campaign)}><Edit3 size={12} /> Edit</button>
                <button className="link-chip" onClick={() => void toggleActive(campaign)}>
                  {campaign.is_active ? <><ToggleRight size={12} /> Pause</> : <><ToggleLeft size={12} /> Activate</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CAMPAIGN_TAGS = ['Electronics', 'Home', 'Beauty', 'Fashion', 'Kitchen', 'Audio', 'Personal Care', 'Appliances'];

function CampaignForm({ editing, onClose, onSaved }: { editing: Campaign | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name || '');
  const [platform, setPlatform] = useState(editing?.platform || 'Amazon');
  const [incentive, setIncentive] = useState(editing ? String(editing.incentive_amount) : '');
  const [link, setLink] = useState(editing?.campaign_link || '');
  const [tags, setTags] = useState<string[]>(editing?.tags || []);
  const [specifications, setSpecifications] = useState(editing?.specifications || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleTag = (tag: string): void => {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const incentiveNum = parseInt(incentive, 10);
    if (isNaN(incentiveNum) || incentiveNum < 0) {
      setError('Enter a valid incentive amount in Rupees.');
      setSaving(false);
      return;
    }
    const { error: rpcError } = await supabase.rpc('save_campaign', {
      p_name: name.trim(),
      p_platform: platform,
      p_incentive: incentiveNum,
      p_link: link.trim(),
      p_campaign_id: editing?.id || null,
      p_tags: tags,
      p_specifications: specifications.trim(),
    });
    if (rpcError) {
      setError('Could not save the campaign. Please try again.');
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="form-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="section-kicker">{editing ? 'EDIT CAMPAIGN' : 'NEW CAMPAIGN'}</div>
        <h2>{editing ? 'Edit campaign' : 'Create a new'} <em>campaign.</em></h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="wide">Campaign Title<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bolt Evo Air Pro Drop" /></label>
            <label>E-Commerce Platform<select value={platform} onChange={(e) => setPlatform(e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label>Exact incentive matrix (in ₹)<input required type="number" min={0} value={incentive} onChange={(e) => setIncentive(e.target.value)} placeholder="e.g. 2500" /></label>
            <label className="wide">Direct destination URL<input required type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></label>
          </div>
          <div className="form-section">
            <span className="form-section-label">Custom tags</span>
            <div className="tag-option-row">
              {CAMPAIGN_TAGS.map((tag) => (
                <button type="button" key={tag} className={tags.includes(tag) ? 'tag-option selected' : 'tag-option'} aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)}>{tag}</button>
              ))}
            </div>
          </div>
          <label className="form-textarea-label">Extra technical details and specifications
            <textarea value={specifications} onChange={(e) => setSpecifications(e.target.value)} maxLength={5000} placeholder="Product guidelines, terms, model specs, delivery notes..." />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full-button" disabled={saving}>{saving ? 'Saving…' : <><Save size={16} /> {editing ? 'Update campaign' : 'Create campaign'}</>} <ArrowRight size={16} /></button>
        </form>
      </div>
    </div>
  );
}

function UserTerminal({ users, blacklist, onRefresh }: { users: AdminUser[]; blacklist: BlacklistEntry[]; onRefresh: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const activeIps = new Set(blacklist.filter((item) => item.is_active).map((item) => item.ip_address));
  const searchableUsers = users.map((user) => ({ orderId: user.email, name: user.display_name || user.email, platform: user.role, deal: user.access_status }));
  const visible = users.filter((user) => matchesOrder({ orderId: user.email, name: user.display_name || '', platform: user.role, deal: user.access_status }, query));
  const activeBlacklist = blacklist.filter((item) => item.is_active);

  const setStatus = async (userId: string, status: 'active' | 'revoked'): Promise<void> => {
    setActing(userId);
    setActionError('');
    const { error } = await supabase.rpc('set_user_access_status', { p_user_id: userId, p_status: status });
    setActing(null);
    if (error) { setActionError(error.message || 'Access status could not be updated.'); return; }
    await onRefresh();
  };

  const blacklistUser = async (user: AdminUser): Promise<void> => {
    setActing(user.id);
    setActionError('');
    const { error } = await supabase.rpc('blacklist_partner_ip', { p_user_id: user.id, p_reason: 'Administrator security review' });
    setActing(null);
    if (error) { setActionError(error.message || 'This account IP could not be blocked.'); return; }
    await onRefresh();
  };

  const setIpStatus = async (ip: string): Promise<void> => {
    setActing(ip);
    setActionError('');
    const { error } = await supabase.rpc('set_agency_ip_blacklist_status', { p_ip: ip, p_is_active: false });
    setActing(null);
    if (error) { setActionError(error.message || 'IP block could not be removed.'); return; }
    await onRefresh();
  };

  return (
    <div className="admin-users">
      <div className="panel-heading"><div><span className="section-kicker">USER MANAGEMENT TERMINAL</span><h2>Security & access control.</h2></div><span className="live-badge"><i /> {users.length} USERS</span></div>
      <div className="dashboard-search"><OrderSearch orders={searchableUsers} onSearch={setQuery} /></div>
      {actionError && <div className="settings-message error" role="alert">{actionError}</div>}
      {visible.length === 0 ? <div className="empty-state"><Search size={30} /><strong>No users found</strong><p>Try a different search term.</p></div> : (
        <div className="user-admin-table">
          <div className="table-head"><span>NAME / REGISTERED</span><span>WHATSAPP / EMAIL</span><span>ROLE</span><span>IP / DEVICE</span><span>STATUS</span><span>ACTIONS</span></div>
          {visible.map((user) => (
            <div className="table-row user-row-admin" key={user.id}>
              <span><strong>{user.display_name || 'Unnamed'}</strong><small className="admin-registered-at">{user.registered_at ? new Date(user.registered_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Registration time unavailable'}</small><small className="admin-registered-at">{user.security_consent_at ? 'Security consent recorded' : 'Security consent unavailable'}</small></span>
              <span>{user.mobile_number || '—'}<br />{user.email}</span>
              <span>{user.role.replace(/_/g, ' ')}</span>
              <span className="ip-device-cell"><span className="ip-line"><MapPin size={12} /> {user.sign_up_ip || '—'}</span><span className="ip-line"><Fingerprint size={12} /> {user.device_fingerprint?.slice(0, 20) || '—'}</span><span className="ip-line">{user.device_metadata?.platform || 'Device details unavailable'} · {user.device_metadata?.timezone || '—'}</span></span>
              <span className={user.access_status === 'active' ? 'table-status verified' : user.access_status === 'banned' ? 'table-status banned' : 'table-status revoked'}><i /> {user.access_status}</span>
              <div className="row-actions">
                <button className="link-chip approve" disabled={acting === user.id || user.access_status === 'active'} onClick={() => void setStatus(user.id, 'active')}><CheckCircle2 size={12} /> Approve</button>
                <button className="link-chip revoke" disabled={acting === user.id || user.access_status === 'revoked'} onClick={() => void setStatus(user.id, 'revoked')}><LockKeyhole size={12} /> Revoke</button>
                <button className="link-chip ban" disabled={acting === user.id || !user.sign_up_ip || activeIps.has(user.sign_up_ip)} onClick={() => void blacklistUser(user)}><Ban size={12} /> {activeIps.has(user.sign_up_ip || '') ? 'IP blocked' : 'Ban + block IP'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <section className="blacklist-admin-panel"><div className="panel-heading"><div><span className="section-kicker">NETWORK CONTROLS</span><h3>Blocked registration IPs.</h3></div><span className="live-badge">{activeBlacklist.length} ACTIVE</span></div>
        {activeBlacklist.length ? activeBlacklist.map((item) => <div className="blacklist-admin-row" key={item.ip_address}><span><strong>{item.ip_address}</strong><small>{item.reason || 'Security review'} · {new Date(item.created_at).toLocaleDateString('en-IN')}</small></span><button className="link-chip approve" disabled={acting === item.ip_address} onClick={() => void setIpStatus(item.ip_address)}><CheckCircle2 size={12} /> Unblock IP</button></div>) : <p className="blacklist-empty">No active IP blocks.</p>}
      </section>
    </div>
  );
}
