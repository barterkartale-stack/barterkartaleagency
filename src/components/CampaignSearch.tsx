import { useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import type { Campaign } from '@/components/CampaignCard';

export function CampaignSearch({ campaigns, query, onQueryChange, onSubmit }: { campaigns: Campaign[]; query: string; onQueryChange: (query: string) => void; onSubmit: () => void }) {
  const [focused, setFocused] = useState(false);
  const normalized = query.trim().toLowerCase();
  const suggestions = normalized
    ? campaigns.filter((campaign) => [campaign.name, campaign.platform, campaign.specifications, ...(campaign.tags || [])].some((value) => value?.toLowerCase().includes(normalized))).slice(0, 5)
    : campaigns.slice(0, 4);

  return (
    <section className="campaign-search-wrap" aria-label="Search campaigns">
      <form className="campaign-search" role="search" onSubmit={(event) => { event.preventDefault(); setFocused(false); onSubmit(); }}>
        <Search size={19} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="Search products, brands, or campaign types"
          aria-label="Search products, brands, or campaigns"
          aria-autocomplete="list"
          aria-expanded={focused}
        />
        <button type="submit" aria-label="View matching campaigns"><ArrowRight size={18} /></button>
      </form>
      {focused && suggestions.length > 0 && (
        <div className="campaign-search-suggestions" role="listbox" aria-label="Campaign suggestions">
          {suggestions.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              role="option"
              aria-selected="false"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onQueryChange(campaign.name); setFocused(false); onSubmit(); }}
            >
              <span><strong>{campaign.name}</strong><small>{campaign.platform} · {(campaign.tags || []).slice(0, 2).join(' · ') || 'Campaign'}</small></span>
              <span className="suggestion-value">₹{Number(campaign.incentive_amount || 0).toLocaleString('en-IN')}</span>
            </button>
          ))}
        </div>
      )}
      {focused && normalized && suggestions.length === 0 && <div className="campaign-search-suggestions campaign-search-empty">No live campaigns match yet.</div>}
    </section>
  );
}
