import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight, ChevronDown, HelpCircle, MessageSquare, X, Send,
  ExternalLink, Zap
} from 'lucide-react';

type ChatMessage = {
  id: number;
  sender: 'bot' | 'user';
  text: string;
  followUps?: string[];
};

type FAQItem = { question: string; answer: string };

const FAQS: FAQItem[] = [
  {
    question: 'How do BarterKartale sponsorships work?',
    answer: 'Brands partner with us to sponsor products for creators. You pick a campaign, fill the order form, receive the product, and share authentic feedback. Full sponsorships mean you keep the product — like Bolt Evo earbuds or Orient fans. Micro-fee campaigns give you a cashback reward instead.',
  },
  {
    question: 'What is the verification window for Ret-Earn tasks?',
    answer: 'After you submit your refund form with proof (screen-recording or photo), our team reviews it within 2 to 4 hours. You will see the status update from "submitted" to "in review" and then to "approved" once verified. Payouts are released only after human review.',
  },
  {
    question: 'How do I upload task screen-recordings?',
    answer: 'Open the "Fill Refund Form" from your order log. The form auto-fills your order details. Under "Supporting proof", drop your PNG, JPG, or MP4 file. Make sure the recording clearly shows the product, rating, and any campaign-specific steps from the brief.',
  },
  {
    question: 'Why do we support zero risk and 100% full refunds?',
    answer: 'Every campaign is built around genuine product experiences. If you follow the brief and submit authentic proof, you are eligible for the stated reward or refund. We do not support fake reviews, manipulated ratings, or off-platform pressure. Your trust is the foundation of the network.',
  },
  {
    question: 'How does the referral program work?',
    answer: 'You earn ₹50 for each active friend who joins and completes a campaign. When you reach 10 verified referrals, you unlock the ₹500 Mega Milestone bonus. Track your progress in the "My Affiliate Net" section of your dashboard.',
  },
];

const WHATSAPP_PUBLIC = 'https://chat.whatsapp.com/HEaCIH60fQ9GrgbxWYWizh';

type KnowledgeEntry = { keywords: string[]; response: string; followUps?: string[] };

const KNOWLEDGE: KnowledgeEntry[] = [
  {
    keywords: ['barterkartale', 'free product', 'sponsorship', 'कैसे काम', 'काम करता'],
    response: 'BarterKartale एक creator commerce platform है। यहाँ brands आपको products sponsor करते हैं। दो तरह के campaigns हैं: (1) Full Sponsorship — product आपके पास रहता है, जैसे Bolt Evo earbuds या Orient fan। (2) Micro-Fee Campaign — आपको cashback मिलता है। Process simple है: campaign चुनो, Fill Order Form भरो, product receive करो, authentic feedback दो। 0% risk, 100% genuine।',
    followUps: ['Ret-Earn (Return & Earning) क्या है?', 'क्या यह 100% सेफ़ है या कोई फ्रॉड है?', 'Fill Order Form'],
  },
  {
    keywords: ['ret-earn', 'return', 'earning', 'refund', 'ret earn', 'रिटर्न'],
    response: 'Ret-Earn approved partners के लिए है। यह model काम करता है: product order करो, असली experience test करो, authentic proof (screen-recording) submit करो, और verification के बाद payout पाओ। Verification window 2-4 hours है। यह stealth portal (/partner-console) पर है, public dashboard पर नहीं।',
    followUps: ['क्या यह 100% सेफ़ है या कोई फ्रॉड है?', 'Referral Bonus और ₹500 Mega Bonus कैसे मिलेगा?', 'Join Ret-Earn WhatsApp Community'],
  },
  {
    keywords: ['safe', 'fraud', 'सेफ', 'फ्रॉड', 'risk', 'रिस्क', 'scam', 'trust'],
    response: 'हाँ, यह 100% सेफ़ है। हमारा model fake reviews या manipulated ratings पर based नहीं है। आप genuine product experience share करते हो, असली proof submit करते हो, और human review के बाद payout मिलता है। Zero-tolerance policy है — कोई fake screenshot या fabricated experience नहीं। Account ban हो सकता है। 0% risk, 100% genuine approach।',
    followUps: ['BarterKartale (Free Products) कैसे काम करता है?', 'Account Safety और Sandwich Rules क्या हैं?', 'Referral Bonus और ₹500 Mega Bonus कैसे मिलेगा?'],
  },
  {
    keywords: ['referral', 'bonus', 'mega', '₹500', '500', 'refer', 'friend', 'रेफर'],
    response: 'Referral program बहुत simple है: हर active friend (जो campaign complete करे) के लिए ₹50 मिलते हैं। 10 verified referrals पर ₹500 Mega Milestone bonus unlock होता है। Dashboard के "My Affiliate Net" section में progress track करो। WhatsApp group share करके दोस्तों को invite कर सकते हो।',
    followUps: ['BarterKartale (Free Products) कैसे काम करता है?', 'Join WhatsApp Community', 'Account Safety और Sandwich Rules क्या हैं?'],
  },
  {
    keywords: ['account', 'safety', 'sandwich', 'rule', 'security', 'अकाउंट', 'सेफ्टी'],
    response: 'Account safety हमारी priority है। Sign-up पर आपकी IP और device fingerprint securely log होती है — fraud prevention के लिए। एक device से multiple fake accounts बनाना block है। Admin panel से accounts को ban या revoke किया जा सकता है। अपना password strong रखो और किसी के साथ share मत करो।',
    followUps: ['क्या यह 100% सेफ़ है या कोई फ्रॉड है?', 'BarterKartale (Free Products) कैसे काम करता है?'],
  },
  {
    keywords: ['fill order', 'order form', 'fill', 'कैसे भर', 'form'],
    response: 'Fill Order Form भरने के लिए: Dashboard पर जाओ, "Fill Order Form" button click करो। अपना Name, Order ID, Delivery Address, Platform (Amazon/Flipkart/Myntra/Meesho), और Deal Type डालो। Submit करो — आपका order log में दिखेगा। उसके बाद "Fill Refund Form" से verification submit कर सकते हो।',
    followUps: ['Ret-Earn (Return & Earning) क्या है?', 'Join WhatsApp Community'],
  },
  {
    keywords: ['whatsapp', 'community', 'group', 'join', 'व्हाट्सएप'],
    response: 'हमारी WhatsApp Community में join करने के लिए dashboard पर "Join WhatsApp Group" button click करो। वहाँ new campaign updates, tips, और community support मिलता है। Ret-Earn के लिए अलग private group है जो approved partners को मिलता है।',
    followUps: ['BarterKartale (Free Products) कैसे काम करता है?', 'Referral Bonus और ₹500 Mega Bonus कैसे मिलेगा?'],
  },
];

const SUGGESTED_BUTTONS = [
  'BarterKartale (Free Products) कैसे काम करता है?',
  'Ret-Earn (Return & Earning) क्या है?',
  'क्या यह 100% सेफ़ है या कोई फ्रॉड है?',
  'Referral Bonus और ₹500 Mega Bonus कैसे मिलेगा?',
  'Account Safety और Sandwich Rules क्या हैं?',
];

const GREETING = 'Namaste! Main BarterKartale Assistant हूँ। आप कुछ भी पूछ सकते हो — sponsorships, Ret-Earn, referrals, account safety। नीचे दिए buttons click करो या अपना question type करो।';

function findResponse(query: string): { text: string; followUps?: string[] } {
  const lower = query.toLowerCase();
  for (const entry of KNOWLEDGE) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return { text: entry.response, followUps: entry.followUps };
    }
  }
  return {
    text: 'इस question का answer अभी मेरे पास नहीं है। आप suggested buttons try कर सकते हो, या हमारी WhatsApp Community में पूछ सकते हो। Team जल्दी help करेगी।',
    followUps: ['BarterKartale (Free Products) कैसे काम करता है?', 'Join WhatsApp Community'],
  };
}

export function HelpCenter() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'faq' | 'chat'>('faq');
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 0, sender: 'bot', text: GREETING, followUps: SUGGESTED_BUTTONS }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const messageIdRef = useRef(1);

  useEffect(() => {
    if (tab === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing, tab]);

  const sendMessage = (text: string): void => {
    const userMsg: ChatMessage = { id: messageIdRef.current++, sender: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setTyping(true);
    window.setTimeout(() => {
      const result = findResponse(text);
      const botMsg: ChatMessage = { id: messageIdRef.current++, sender: 'bot', text: result.text, followUps: result.followUps };
      setMessages((prev) => [...prev, botMsg]);
      setTyping(false);
    }, 500);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
  };

  const handleFollowUp = (text: string): void => {
    if (text === 'Fill Order Form') { setOpen(false); window.location.href = '/dashboard'; return; }
    if (text === 'Join WhatsApp Community' || text === 'Join Ret-Earn WhatsApp Community') { window.open(WHATSAPP_PUBLIC, '_blank', 'noopener'); return; }
    sendMessage(text);
  };

  return (
    <>
      <button className={`help-fab ${open ? 'hidden' : ''}`} onClick={() => setOpen(true)} aria-label="Open help and support">
        <HelpCircle size={24} />
        <span className="fab-ring" />
      </button>

      {open && (
        <div className="help-drawer-backdrop" onMouseDown={() => setOpen(false)}>
          <div className="help-drawer" onMouseDown={(e) => e.stopPropagation()}>
            <div className="help-drawer-header">
              <div className="help-drawer-title">
                <MessageSquare size={20} />
                <span>Help & Support</span>
              </div>
              <button className="help-close" onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button>
            </div>

            <div className="help-tabs">
              <button className={tab === 'faq' ? 'help-tab active' : 'help-tab'} onClick={() => setTab('faq')}><HelpCircle size={15} /> FAQs</button>
              <button className={tab === 'chat' ? 'help-tab active' : 'help-tab'} onClick={() => setTab('chat')}><MessageSquare size={15} /> AI Assistant</button>
            </div>

            <div className="help-content">
              {tab === 'faq' ? (
                <div className="faq-list">
                  {FAQS.map((faq, index) => (
                    <div className="faq-item" key={index}>
                      <button className={`faq-question ${openFaq === index ? 'open' : ''}`} onClick={() => setOpenFaq(openFaq === index ? null : index)}>
                        <span>{faq.question}</span>
                        <ChevronDown size={16} className={openFaq === index ? 'chevron-up' : ''} />
                      </button>
                      {openFaq === index && <div className="faq-answer"><p>{faq.answer}</p></div>}
                    </div>
                  ))}
                  <a className="faq-whatsapp-link" href={WHATSAPP_PUBLIC} target="_blank" rel="noopener noreferrer">
                    <span>Still need help? Join our WhatsApp Community</span>
                    <ExternalLink size={15} />
                  </a>
                </div>
              ) : (
                <div className="chat-container">
                  <div className="chat-messages">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`chat-msg ${msg.sender}`}>
                        {msg.sender === 'bot' && <div className="chat-bot-icon"><Zap size={14} /></div>}
                        <div className="chat-bubble">
                          <p>{msg.text}</p>
                          {msg.followUps && msg.followUps.length > 0 && (
                            <div className="chat-followups">
                              {msg.followUps.map((fu) => (
                                <button key={fu} className="chat-followup-btn" onClick={() => handleFollowUp(fu)}>{fu} <ArrowRight size={12} /></button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {typing && <div className="chat-msg bot"><div className="chat-bot-icon"><Zap size={14} /></div><div className="chat-bubble typing"><span /><span /><span /></div></div>}
                    <div ref={chatEndRef} />
                  </div>
                  <form className="chat-input-bar" onSubmit={handleSubmit}>
                    <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" />
                    <button type="submit" aria-label="Send" disabled={!input.trim()}><Send size={17} /></button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
