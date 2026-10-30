import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { ArrowRight, Check, Clipboard, FileSearch, Link2, LoaderCircle, Plus, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type FormSettings = { order_form_url: string; refund_form_url: string; order_field_map: Record<string, string>; refund_field_map: Record<string, string> };
type DiscoveredField = { label: string; entryId: string; suggestedKey: string | null };
const orderFields = [['name', 'Partner name'], ['delivery_address', 'Delivery address'], ['platform', 'Marketplace'], ['campaign_type', 'Campaign type'], ['tracking_order_id', 'Order / tracking ID']] as const;
const refundFields = [['name', 'Partner name'], ['platform', 'Marketplace'], ['campaign_type', 'Campaign type'], ['upi_id', 'UPI ID'], ['proof_filename', 'Proof filename'], ['enrollment_id', 'Enrollment ID']] as const;

async function loadSettings(): Promise<FormSettings> {
  const { data, error } = await supabase.rpc('get_google_form_settings');
  if (error) throw error;
  return data as FormSettings;
}

export function GoogleFormSettings() {
  const { data, error: loadError, isLoading, mutate } = useSWR('google-form-settings', loadSettings);
  const [orderUrl, setOrderUrl] = useState('');
  const [refundUrl, setRefundUrl] = useState('');
  const [orderMap, setOrderMap] = useState<Record<string, string>>({});
  const [refundMap, setRefundMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [discovered, setDiscovered] = useState<{ type: 'order' | 'refund'; fields: DiscoveredField[] } | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!data) return;
    setOrderUrl(data.order_form_url || '');
    setRefundUrl(data.refund_form_url || '');
    setOrderMap(data.order_field_map || {});
    setRefundMap(data.refund_field_map || {});
  }, [data]);

  const discover = async (type: 'order' | 'refund') => {
    const url = type === 'order' ? orderUrl : refundUrl;
    setBusy(`discover-${type}`);
    setMessage('');
    const { data: result, error } = await supabase.functions.invoke('sync-google-form', { body: { action: 'discover', formType: type, url } });
    setBusy('');
    if (error || result?.error) {
      setMessage(result?.error || error?.message || 'Could not inspect that form. Confirm it is published and anyone with the link can respond.');
      return;
    }
    const nextMap = result?.suggestedMap as Record<string, string> | undefined;
    if (type === 'order') setOrderMap((current) => ({ ...current, ...nextMap }));
    else setRefundMap((current) => ({ ...current, ...nextMap }));
    setDiscovered({ type, fields: (result?.fields || []) as DiscoveredField[] });
    setMessage(`Found ${result?.fields?.length || 0} form fields. Review the suggested mapping before saving.`);
  };

  const save = async () => {
    setBusy('save');
    setMessage('');
    const [orderRead, refundRead] = await Promise.all([
      supabase.functions.invoke('sync-google-form', { body: { action: 'discover', formType: 'order', url: orderUrl.trim() } }),
      supabase.functions.invoke('sync-google-form', { body: { action: 'discover', formType: 'refund', url: refundUrl.trim() } }),
    ]);
    const discoveryError = orderRead.error || refundRead.error || orderRead.data?.error || refundRead.data?.error;
    if (discoveryError) {
      setBusy('');
      setMessage(typeof discoveryError === 'string' ? discoveryError : 'Could not read both published forms. Confirm that each link is public and try again.');
      return;
    }
    const nextOrderMap = { ...(orderRead.data?.suggestedMap || {}), ...orderMap } as Record<string, string>;
    const nextRefundMap = { ...(refundRead.data?.suggestedMap || {}), ...refundMap } as Record<string, string>;
    setOrderMap(nextOrderMap);
    setRefundMap(nextRefundMap);
    setDiscovered({ type: 'order', fields: (orderRead.data?.fields || []) as DiscoveredField[] });
    if (!Object.values(nextOrderMap).some(Boolean) || !Object.values(nextRefundMap).some(Boolean)) {
      setBusy('');
      setMessage('Form fields were detected, but at least one mapping is missing. Review detected fields and enter the numeric entry ID before saving.');
      return;
    }
    const { error } = await supabase.rpc('save_google_form_settings', {
      p_order_form_url: orderUrl.trim(),
      p_refund_form_url: refundUrl.trim(),
      p_order_field_map: nextOrderMap,
      p_refund_field_map: nextRefundMap,
    });
    setBusy('');
    if (error) {
      setMessage(error.message || 'Could not save Google Forms settings.');
      return;
    }
    await mutate();
    setMessage('Google Forms settings saved. New order and refund submissions will sync automatically.');
  };

  const createInvite = async () => {
    setBusy('invite');
    setMessage('');
    const { data: result, error } = await supabase.rpc('issue_agency_invitation_code', { p_max_uses: 1, p_expires_at: null });
    setBusy('');
    if (error || !result?.[0]?.code) {
      setMessage(error?.message || 'Could not create an invitation code.');
      return;
    }
    setInviteCode(result[0].code as string);
    setCopied(false);
  };

  const copyInvite = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
    } catch {
      setMessage('Clipboard access was unavailable. Select and copy the invitation code.');
    }
  };

  if (isLoading) return <div className="empty-state"><LoaderCircle size={22} className="spin" /> Loading integration settings…</div>;

  return (
    <div className="integration-settings">
      <div className="panel-heading"><div><span className="section-kicker">PRIVATE DATA DESTINATIONS</span><h2>Google Forms sync.</h2></div><span className="live-badge"><i /> SERVER-SIDE</span></div>
      <p className="settings-intro">Paste each published form URL. The system reads available fields, suggests a mapping, and posts partner submissions directly from the server so form destinations stay private.</p>
      {loadError && <div className="settings-message error">Saved settings could not be loaded. Refresh and try again.</div>}
      <div className="form-config-grid">
        <FormConfig type="order" title="Order enrollment" value={orderUrl} onChange={setOrderUrl} onDiscover={() => void discover('order')} busy={busy === 'discover-order'} fields={orderFields} mapping={orderMap} onMapping={(key, value) => setOrderMap((current) => ({ ...current, [key]: value }))} />
        <FormConfig type="refund" title="Refund request" value={refundUrl} onChange={setRefundUrl} onDiscover={() => void discover('refund')} busy={busy === 'discover-refund'} fields={refundFields} mapping={refundMap} onMapping={(key, value) => setRefundMap((current) => ({ ...current, [key]: value }))} />
      </div>
      {discovered && <div className="detected-fields"><strong>Detected {discovered.type === 'order' ? 'order' : 'refund'} fields</strong><div>{discovered.fields.slice(0, 8).map((field) => <span key={field.entryId}>{field.label.slice(0, 60)} · entry.{field.entryId}</span>)}</div></div>}
      <div className="settings-actions"><button className="primary-button" onClick={() => void save()} disabled={busy === 'save' || !orderUrl.trim() || !refundUrl.trim()}>{busy === 'save' ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Save destinations <ArrowRight size={15} /></button></div>
      {message && <div className={`settings-message ${message.toLowerCase().includes('could not') || message.toLowerCase().includes('unavailable') ? 'error' : 'success'}`} role="status">{message}</div>}
      <div className="invite-generator">
        <div><span className="section-kicker">PARTNER ACCESS</span><h3>Issue an invitation code</h3><p>Single-use codes expire in 7 days and are required before account registration.</p></div>
        <div className="invite-actions"><button className="secondary-button" onClick={() => void createInvite()} disabled={busy === 'invite'}>{busy === 'invite' ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} Create code</button>{inviteCode && <div className="invite-code"><code>{inviteCode}</code><button aria-label="Copy invitation code" onClick={() => void copyInvite()}>{copied ? <Check size={16} /> : <Clipboard size={16} />}</button></div>}</div>
      </div>
      <div className="privacy-note"><ShieldCheck size={16} /><span>Form URLs and mappings are stored in a restricted table. Submission payloads are sent server-to-server and are not exposed in the browser.</span></div>
    </div>
  );
}

function FormConfig({ type, title, value, onChange, onDiscover, busy, fields, mapping, onMapping }: {
  type: 'order' | 'refund'; title: string; value: string; onChange: (value: string) => void; onDiscover: () => void; busy: boolean;
  fields: readonly (readonly [string, string])[]; mapping: Record<string, string>; onMapping: (key: string, value: string) => void;
}) {
  return (
    <section className="form-config-card">
      <div className="form-config-heading"><span className="form-type-icon"><Link2 size={16} /></span><div><strong>{title}</strong><small>{type === 'order' ? 'Campaign enrollment submissions' : 'Refund verification submissions'}</small></div></div>
      <label>Published Google Form URL<input type="url" required value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://docs.google.com/forms/d/e/…/viewform" /></label>
      <button className="discover-button" onClick={onDiscover} disabled={busy || !value.trim()}>{busy ? <LoaderCircle size={15} className="spin" /> : <FileSearch size={15} />} Read form fields</button>
      <div className="field-map-list">{fields.map(([key, label]) => <label key={key}>{label}<div className="entry-id-input"><span>entry.</span><input inputMode="numeric" pattern="[0-9]{1,20}" value={mapping[key] || ''} onChange={(event) => onMapping(key, event.target.value.replace(/\D/g, '').slice(0, 20))} placeholder="auto" /></div></label>)}</div>
    </section>
  );
}
