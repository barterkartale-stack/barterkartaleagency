import { ArrowRight, IndianRupee } from 'lucide-react';
import '@/components/campaigns.css';

export type Campaign = {
  id: string;
  name: string;
  platform: string;
  incentive_amount: number;
  campaign_link: string;
  tags: string[];
  specifications: string;
};

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  return (
    <article className="campaign-card-live">
      <div className="campaign-card-glow" aria-hidden="true" />
      <div className="campaign-card-body">
        <div className="campaign-card-top">
          <span className="campaign-platform">{campaign.platform}</span>
          {campaign.tags.slice(0, 2).map((tag) => <span key={tag} className="campaign-tag-chip">{tag}</span>)}
        </div>
        <h3>{campaign.name}</h3>
        <div className="campaign-card-value">
          <span>Incentive</span>
          <strong><IndianRupee size={16} />{campaign.incentive_amount.toLocaleString('en-IN')}</strong>
        </div>
        {campaign.specifications && <p className="campaign-card-specs">{campaign.specifications}</p>}
        <a className="campaign-card-cta" href={campaign.campaign_link} target="_blank" rel="noopener noreferrer">View campaign <ArrowRight size={15} /></a>
      </div>
    </article>
  );
}
