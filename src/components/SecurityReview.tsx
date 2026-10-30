import { Clock3, LogOut, ShieldCheck, ShieldX } from 'lucide-react';

function formatIst(value: string | null): string {
  if (!value) return 'the time of your registration';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(new Date(value).getTime() + 2 * 60 * 60 * 1000)) + ' IST';
}

export function SecurityReview({ registeredAt, status, onSignOut }: { registeredAt: string | null; status: string; onSignOut: () => void }) {
  const restricted = status === 'banned' || status === 'revoked';

  return (
    <section className="security-review-page" aria-live="polite">
      <div className="security-review-card">
        <div className={restricted ? 'security-review-icon restricted' : 'security-review-icon'}>
          {restricted ? <ShieldX size={26} /> : <ShieldCheck size={26} />}
        </div>
        <span className="section-kicker">{restricted ? 'ACCOUNT ACCESS' : 'PARTNER SECURITY REVIEW'}</span>
        <h1>{restricted ? <>Access <em>unavailable.</em></> : <>Your account is <em>in review.</em></>}</h1>
        {restricted ? (
          <p>This account is not currently cleared for the partner console. If you believe this is a mistake, contact the team through the official support channel.</p>
        ) : (
          <>
            <p>Thanks for completing registration. Your partner console will unlock after the security review is complete.</p>
            <div className="review-time-row"><Clock3 size={17} /><span>Account security audit in progress. Verification window: 2 to 4 hours. Please return to log in after <strong>{formatIst(registeredAt)}</strong> for your activation status.</span></div>
            <p className="review-expectation">Your account will remain restricted until an administrator completes the review. Please check back after the time above; additional checks may take longer.</p>
          </>
        )}
        <button className="review-signout" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
      </div>
    </section>
  );
}
