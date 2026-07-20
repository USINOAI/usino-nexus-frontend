import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Terminal, Send, LogOut, Zap } from 'lucide-react';
import {
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
  useAuth,
  useUser,
} from '@clerk/clerk-react';

const CLERK_PUBLISHABLE_KEY =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  'pk_test_a2luZC1hcGhpZC0yMy5jbGVyay5hY2NvdW50cy5kZXYk';
const API_BASE = 'https://usino-nexus.fly.dev';
const STRIPE_PRICE_L2 = 'price_1TtsudALcJ18DmKpR5EmB4dN';
const STRIPE_PRICE_L3 = 'price_1TtswIALcJ18DmKpj29KStNo';
const STRIPE_TOPUP_L1 = 'price_1Tu3xwALcJ18DmKpfq9H9NFX'; // +7 queries $10
const STRIPE_TOPUP_L2 = 'price_1Tu3ylALcJ18DmKpiFx5MWts'; // +25 queries
const STRIPE_TOPUP_L3 = 'price_1Tu3zsALcJ18DmKplKQPDWUh'; // +50 queries

const TIER_LABELS = { l1: 'L1 FREE', l2: 'L2 ANALYST', l3: 'L3 ENTERPRISE' };
const TIER_COLORS = { l1: '#475569', l2: '#38bdf8', l3: '#a855f7' };

// ─── USINO Brief renderer ─────────────────────────────────────────────────────

const SECTION_LABELS = [
  'INTELLIGENCE BRIEF',
  'SUPPLY CHAIN ANGLE',
  'US MARKET SIGNAL',
  'WATCHLIST',
  'RISK FLAGS',
];

function normalise(text) {
  let t = text;
  SECTION_LABELS.forEach(label => {
    const reBefore = new RegExp(`([^\\n])(\\*\\*)?${label}(\\*\\*)?`, 'g');
    t = t.replace(reBefore, `$1\n\n**${label}**`);
    const reAfter = new RegExp(`(\\*\\*${label}\\*\\*)([^\\n])`, 'g');
    t = t.replace(reAfter, `$1\n$2`);
    const reBare = new RegExp(`^${label}$`, 'gm');
    t = t.replace(reBare, `**${label}**`);
  });
  return t;
}

function inline(text) {
  const parts = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0, match, idx = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={idx++} style={{ color: '#f8fafc' }}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={idx++} style={{ color: '#e2e8f0' }}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={idx++} style={{ backgroundColor: '#1e293b', padding: '1px 5px', borderRadius: '3px', fontSize: '12px', color: '#38bdf8' }}>{match[4]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}

function renderMarkdown(text) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const level = trimmed.startsWith('### ') ? 3 : trimmed.startsWith('## ') ? 2 : 1;
      const text = trimmed.replace(/^#{1,3}\s+/, '');
      const sizes = { 1: '18px', 2: '15px', 3: '13px' };
      elements.push(
        <div key={i} style={{ fontWeight: 'bold', fontSize: sizes[level], color: '#f8fafc', margin: level === 1 ? '8px 0 12px' : '16px 0 8px', letterSpacing: level === 3 ? '0.05em' : 0, textAlign: 'left' }}>
          {text}
        </div>
      );
    } else if (trimmed.startsWith('Market intelligence only.')) {
      const parts = trimmed.split(/\.\s+(?=USINO)/);
      elements.push(
        <div key={i} style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #1e293b', fontSize: '11px', color: '#475569', fontStyle: 'italic', textAlign: 'left' }}>
          {parts.map((p, j) => <div key={j}>{p}{j < parts.length - 1 ? '.' : ''}</div>)}
        </div>
      );
    } else if (trimmed === '---') {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '16px 0' }} />);
    } else if (trimmed.startsWith('**') && trimmed.endsWith('**') && SECTION_LABELS.some(s => trimmed.includes(s))) {
      const label = trimmed.replace(/\*\*/g, '');
      elements.push(
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '20px 0 8px' }}>
          <span style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.12em', color: '#38bdf8', textTransform: 'uppercase' }}>{label}</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#1e293b' }} />
        </div>
      );
    } else if (trimmed.startsWith('**[HEADLINE]**') || trimmed.startsWith('**[')) {
      const headline = trimmed.replace(/^\*\*\[HEADLINE\]\*\*\s*—?\s*/, '').replace(/\*\*/g, '');
      elements.push(
        <div key={i} style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc', lineHeight: '1.4', margin: '4px 0 16px', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
          {headline}
        </div>
      );
    } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Markdown table row — collect all consecutive table rows
      const tableRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableRows.push(lines[i].trim());
        i++;
      }
      // Filter out separator rows (---|---|---)
      const dataRows = tableRows.filter(r => !/^\|[\s\-|:]+\|$/.test(r));
      const isHeader = dataRows.length > 0;
      dataRows.forEach((row, ri) => {
        const cells = row.split('|').map(c => c.trim()).filter((_, ci) => ci > 0 && ci < row.split('|').length - 1);
        elements.push(
          <div key={`${i}-${ri}`} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: '1px solid #0f172a', alignItems: 'baseline', background: ri % 2 === 0 ? 'transparent' : '#0a0f1a' }}>
            <span style={{ fontWeight: ri === 0 && isHeader ? 'bold' : 'bold', color: '#38bdf8', fontSize: '12px', minWidth: '90px', fontFamily: 'monospace' }}>{cells[0]}</span>
            {cells[1] && <span style={{ color: '#94a3b8', fontSize: '12px', minWidth: '120px' }}>{cells[1]}</span>}
            {cells[2] && <span style={{ color: '#64748b', fontSize: '12px', flex: 1 }}>{cells[2]}</span>}
          </div>
        );
      });
      continue;
    } else if (trimmed.match(/^[A-Z0-9.]{2,12}\s*\|/) && !trimmed.startsWith('|')) {
      const parts = trimmed.split('|').map(p => p.trim());
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: '1px solid #0f172a', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '12px', minWidth: '80px', fontFamily: 'monospace' }}>{parts[0]}</span>
          <span style={{ color: '#94a3b8', fontSize: '12px', minWidth: '140px' }}>{parts[1]}</span>
          <span style={{ color: '#64748b', fontSize: '12px', flex: 1 }}>{parts[2]}</span>
        </div>
      );
    } else if (trimmed.match(/^[A-Z]{1,6}\s*\(/) && trimmed.includes('—')) {
      // Split on ".— TICKER" pattern (no lookbehind needed)
      const tickerLines = trimmed.split(/\.\s*[-–—]\s*(?=[A-Z]{1,6}\s*\()/)
        .map(s => s.trim()).filter(Boolean);
      tickerLines.forEach((tl, ti) => {
        const m = tl.match(/^(.+?\))\s*[-–—]\s*(.+)$/);
        const ticker = m ? m[1].trim() : tl;
        const rationale = m ? m[2].trim() : '';
        elements.push(
          <div key={`${i}-${ti}`} style={{ display: 'flex', gap: '10px', margin: '4px 0', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 'bold', color: '#22c55e', fontSize: '12px', minWidth: '130px', fontFamily: 'monospace' }}>{ticker}</span>
            {rationale && <span style={{ color: '#94a3b8', fontSize: '13px' }}>— {rationale}</span>}
          </div>
        );
      });
    } else if (trimmed.match(/^[-•]\s/)) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '8px', margin: '4px 0', paddingLeft: '4px' }}>
          <span style={{ color: '#ef4444', flexShrink: 0, fontSize: '12px' }}>▸</span>
          <span style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6' }}>{inline(trimmed.slice(2))}</span>
        </div>
      );
    } else if (trimmed === '**' || trimmed === '*') {
      // stray markdown artifacts — skip
    } else if (trimmed === '') {
      elements.push(<div key={i} style={{ height: '8px' }} />);
    } else {
      elements.push(
        <p key={i} style={{ margin: '4px 0', color: '#cbd5e1', lineHeight: '1.7', fontSize: '13px', fontFamily: 'ui-sans-serif, system-ui, sans-serif', textAlign: 'left' }}>
          {inline(line)}
        </p>
      );
    }
    i++;
  }
  return elements;
}

// ─── Clerk appearance shared config ──────────────────────────────────────────

const CLERK_APPEARANCE = {
  elements: {
    rootBox: { fontFamily: 'ui-monospace, monospace' },
    card: { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', boxShadow: 'none' },
    headerTitle: { color: '#f8fafc', fontFamily: 'ui-monospace, monospace' },
    headerSubtitle: { color: '#64748b' },
    formFieldLabel: { color: '#94a3b8', fontSize: '12px' },
    formFieldInput: { backgroundColor: '#020617', border: '1px solid #334155', color: '#f8fafc', fontFamily: 'ui-monospace, monospace' },
    formButtonPrimary: { backgroundColor: '#38bdf8', color: '#0f172a', fontFamily: 'ui-monospace, monospace', fontWeight: 'bold' },
    footerActionLink: { color: '#38bdf8' },
    dividerLine: { backgroundColor: '#1e293b' },
    dividerText: { color: '#475569' },
    socialButtonsBlockButton: { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' },
    socialButtonsBlockButtonText: { color: '#e2e8f0' },
  }
};

// ─── Sign-in modal overlay ────────────────────────────────────────────────────

function SignInModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ position: 'relative' }}>
        {onClose && (
          <button onClick={onClose} style={{ position: 'absolute', top: -12, right: -12, background: '#1e293b', border: '1px solid #334155', borderRadius: '50%', width: 28, height: 28, color: '#94a3b8', cursor: 'pointer', fontSize: 16, zIndex: 101, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        )}
        <div style={{ marginBottom: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#38bdf8', letterSpacing: '0.1em', marginBottom: '4px' }}>1 FREE QUERY USED</div>
          <div style={{ color: '#94a3b8', fontSize: '12px' }}>Sign in to continue querying USINO NEXUS</div>
        </div>
        <SignIn appearance={CLERK_APPEARANCE} />
      </div>
    </div>
  );
}

// ─── Main chat (inside ClerkProvider — can use useAuth) ───────────────────────

function NexusChat() {
  const { getToken, signOut } = useAuth();
  const { user } = useUser();

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "### USINO NEXUS — ONLINE\n\n**SYSTEM STATUS:** READY\n\nEnter any supply chain question to generate institutional-grade market intelligence."
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [tier, setTier] = useState('l1');
  const [usage, setUsage] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const messagesEndRef = useRef(null);

  // PDF download — opens print window
  const downloadPDF = useCallback((htmlContent) => {
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>USINO.AI Insight Report</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { margin: 0; padding: 0; background: #fff; }
        @page { margin: 0.6in; size: A4; }
        .no-print { display: flex; padding: 14px 20px; background: #f0f0f0; gap: 10px; font-family: Arial, sans-serif; }
        @media print { .no-print { display: none !important; } }
        button { padding: 9px 20px; border: none; cursor: pointer; font-size: 13px; border-radius: 4px; }
      </style>
    </head><body>
      <div class="no-print">
        <button onclick="window.print()" style="background:#1a1a1a;color:#fff;">Print / Save as PDF</button>
        <button onclick="window.close()" style="background:#666;color:#fff;">Close</button>
        <span style="margin-left:8px;font-size:12px;color:#666;align-self:center;">Use Chrome → Print → Save as PDF for best results</span>
      </div>
      ${htmlContent}
    </body></html>`);
    win.document.close();
  }, []);

  // Generate full PDF report from any standard response
  const handleGenerateReport = useCallback(async (sourceContent) => {
    if (loading) return;
    setLoading(true);
    const prompt = `Generate a full institutional insight report based on the following intelligence brief. Expand into a comprehensive multi-section report with risk register, watchlist, and USINO.AI VIEW callouts.\n\nSOURCE BRIEF:\n${sourceContent}`;
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE}/api/v1/research/intelligence/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt, task_type: 'insight_report' }),
      });
      if (response.status === 429) {
        setShowUpgrade(true); setLoading(false); return;
      }
      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiReply = '', messageAdded = false, buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).replace(/\\n/g, '\n');
          if (data === '[COMPLETE]') { setLoading(false); continue; }
          if (data.startsWith('[ERROR]')) { setLoading(false); return; }
          aiReply += data;
          if (!messageAdded) {
            setMessages(prev => [...prev, { role: 'assistant', content: aiReply, msgType: 'insight_report' }]);
            messageAdded = true;
          } else {
            setMessages(prev => {
              const u = [...prev];
              u[u.length - 1] = { ...u[u.length - 1], content: aiReply, msgType: 'insight_report' };
              return u;
            });
          }
        }
      }
    } catch (err) {
      console.error('Report error:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, loading]);

  const params = new URLSearchParams(window.location.search);
  const [showSuccessBanner, setShowSuccessBanner] = useState(params.get('upgraded') === 'true');
  const [showTopupBanner, setShowTopupBanner] = useState(params.get('topup') === 'true');
  const [bonusQueries, setBonusQueries] = useState(0);

  // Fetch subscription tier + bonus on mount (poll after Stripe redirect)
  useEffect(() => {
    const isReturn = params.get('upgraded') === 'true' || params.get('topup') === 'true';
    const fetchTier = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/api/v1/stripe/subscription-status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTier(data.tier || 'l1');
          setBonusQueries(data.bonus_queries || 0);
        }
        const uRes = await fetch(`${API_BASE}/api/v1/research/usage`, {
          headers: { 'Authorization': `Bearer ${await getToken()}` }
        });
        if (uRes.ok) setUsage(await uRes.json());
      } catch (_) {}
    };

    fetchTier();
    if (isReturn) {
      const t1 = setTimeout(fetchTier, 3000);
      const t2 = setTimeout(fetchTier, 7000);
      const t3 = setTimeout(() => {
        fetchTier();
        window.history.replaceState({}, '', '/');
      }, 12000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [getToken]);

  const handleUpgrade = async (priceId) => {
    setUpgrading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/v1/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ price_id: priceId }),
      });
      const data = await res.json();
      if (data.checkout_url) window.location.href = data.checkout_url;
    } catch (e) {
      console.error('Checkout error:', e);
    } finally {
      setUpgrading(false);
    }
  };

  const handleTopup = async (priceId) => {
    setUpgrading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/v1/stripe/create-topup-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ price_id: priceId }),
      });
      const data = await res.json();
      if (data.checkout_url) window.location.href = data.checkout_url;
    } catch (e) {
      console.error('Top-up error:', e);
    } finally {
      setUpgrading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const parseCommand = (raw) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('/brief '))  return { task_type: 'html_brief', prompt: trimmed.slice(7).trim() };
    if (trimmed.startsWith('/weekly ')) return { task_type: 'weekly',     prompt: trimmed.slice(8).trim() };
    return { task_type: 'standard', prompt: trimmed };
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const { task_type, prompt: userPrompt } = parseCommand(input);
    const rawInput = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: rawInput }]);
    setLoading(true);

    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE}/api/v1/research/intelligence/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: userPrompt, task_type })
      });

      if (response.status === 429) {
        const err = await response.json();
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `### QUERY LIMIT REACHED\n\nYou've used all **${err.detail?.limit} queries** for this period.\n\nTop up or upgrade to continue.`
        }]);
        setShowUpgrade(true);
        setLoading(false);
        return;
      }
      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiReply = '';
      let messageAdded = false;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).replace(/\\n/g, '\n');
          if (data === '[COMPLETE]') { setLoading(false); continue; }
          if (data.startsWith('[ERROR]')) {
            setMessages(prev => [...prev, { role: 'assistant', content: `### ERROR\n${data}` }]);
            setLoading(false);
            return;
          }
          aiReply += data;
          if (!messageAdded) {
            setMessages(prev => [...prev, { role: 'assistant', content: aiReply }]);
            messageAdded = true;
          } else {
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], content: aiReply };
              return updated;
            });
          }
        }
      }
    } catch (error) {
      console.error('API Error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: `### ERROR\n${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0b0f19', color: '#e2e8f0', fontFamily: 'ui-monospace, monospace' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={18} style={{ color: '#38bdf8' }} />
          <span style={{ fontWeight: 'bold', letterSpacing: '0.05em' }}>USINO NEXUS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#22c55e', fontSize: '12px' }}>● Live</span>
          {/* Tier badge */}
          <span style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em', color: TIER_COLORS[tier], border: `1px solid ${TIER_COLORS[tier]}`, borderRadius: '3px', padding: '2px 7px' }}>
            {TIER_LABELS[tier]}
          </span>
          {/* Usage counter — daily for L1, monthly pool for L2/L3 */}
          {tier === 'l1' && usage && (
            <span style={{ fontSize: '11px', color: usage.remaining === 0 ? '#ef4444' : '#64748b' }}>
              {usage.remaining}/{usage.limit} queries left today
            </span>
          )}
          {tier === 'l2' && usage && (
            <span style={{ fontSize: '11px', color: usage.remaining === 0 ? '#ef4444' : '#64748b' }}>
              {usage.remaining}/{usage.limit} queries left this month
              {usage.bonus_queries > 0 && <span style={{ color: '#22c55e' }}> (+{usage.bonus_queries} bonus)</span>}
            </span>
          )}
          {tier === 'l3' && usage && (
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {usage.used}/{usage.limit} used this month
              {usage.bonus_queries > 0 && <span style={{ color: '#22c55e' }}> (+{usage.bonus_queries} bonus)</span>}
            </span>
          )}
          {/* Upgrade button — L1 and L2 (L3 is top tier, nothing to upgrade to) */}
          {(tier === 'l1' || tier === 'l2') && (
            <button
              onClick={() => setShowUpgrade(true)}
              style={{ background: 'linear-gradient(135deg, #38bdf8, #a855f7)', border: 'none', borderRadius: '4px', padding: '4px 12px', color: '#0f172a', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Zap size={11} /> Upgrade
            </button>
          )}
          {/* L1: top-up button (if not already at daily cap) */}
          {tier === 'l1' && (
            <button
              onClick={() => handleTopup(STRIPE_TOPUP_L1)}
              disabled={upgrading}
              style={{ background: 'none', border: '1px solid #334155', borderRadius: '4px', padding: '4px 10px', color: '#94a3b8', cursor: upgrading ? 'wait' : 'pointer', fontSize: '11px' }}
            >
              +7 queries $10
            </button>
          )}
          {/* L2/L3: top-up button */}
          {tier === 'l2' && (
            <button
              onClick={() => handleTopup(STRIPE_TOPUP_L2)}
              disabled={upgrading}
              style={{ background: 'none', border: '1px solid #334155', borderRadius: '4px', padding: '4px 10px', color: '#38bdf8', cursor: upgrading ? 'wait' : 'pointer', fontSize: '11px' }}
            >
              +25 queries $75
            </button>
          )}
          {tier === 'l3' && (
            <button
              onClick={() => handleTopup(STRIPE_TOPUP_L3)}
              disabled={upgrading}
              style={{ background: 'none', border: '1px solid #7e22ce', borderRadius: '4px', padding: '4px 10px', color: '#a855f7', cursor: upgrading ? 'wait' : 'pointer', fontSize: '11px' }}
            >
              +50 queries $600
            </button>
          )}
          {user && (
            <span style={{ color: '#475569', fontSize: '11px' }}>{user.primaryEmailAddress?.emailAddress}</span>
          )}
          <button
            onClick={() => signOut()}
            style={{ background: 'none', border: '1px solid #1e293b', borderRadius: '4px', padding: '4px 10px', color: '#64748b', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <LogOut size={11} /> Sign out
          </button>
        </div>
      </div>

      {/* Subscription success banner */}
      {showSuccessBanner && (
        <div style={{ backgroundColor: '#052e16', borderBottom: '1px solid #166534', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#22c55e', fontSize: '13px' }}>✓ Subscription activated — your tier will update within seconds.</span>
          <button onClick={() => setShowSuccessBanner(false)} style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', fontSize: '16px' }}>×</button>
        </div>
      )}

      {/* Top-up success banner */}
      {showTopupBanner && (
        <div style={{ backgroundColor: '#0c1a2e', borderBottom: '1px solid #1e3a5f', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#38bdf8', fontSize: '13px' }}>✓ Top-up processed — bonus queries added to your account.</span>
          <button onClick={() => setShowTopupBanner(false)} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '16px' }}>×</button>
        </div>
      )}

      {/* Upgrade modal */}
      {showUpgrade && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '32px', maxWidth: '480px', width: '90%', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', color: '#a855f7', letterSpacing: '0.1em', marginBottom: '8px', fontFamily: 'ui-monospace, monospace' }}>UPGRADE ACCESS</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f8fafc' }}>Institutional Intelligence</div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Unlock full supply chain coverage, expanded queries, and priority routing.</div>
            </div>

            {/* L1 top-up — only show if currently L1 */}
            {tier === 'l1' && (
              <div style={{ border: '1px solid #1e293b', borderRadius: '8px', padding: '16px 20px', marginBottom: '12px', backgroundColor: '#0b0f19' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 'bold', color: '#94a3b8', fontSize: '13px' }}>L1 TOP-UP</span>
                  <span style={{ color: '#f8fafc', fontSize: '16px', fontWeight: 'bold' }}>$10</span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>+7 bonus queries → raises your daily cap from 3 to 10</div>
                <button
                  onClick={() => { handleTopup(STRIPE_TOPUP_L1); setShowUpgrade(false); }}
                  disabled={upgrading}
                  style={{ width: '100%', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', padding: '8px', fontWeight: 'bold', cursor: upgrading ? 'wait' : 'pointer', fontSize: '12px' }}
                >
                  {upgrading ? 'Redirecting...' : 'Top Up — L1'}
                </button>
              </div>
            )}

            {/* L2 — hidden once already subscribed */}
            {tier !== 'l2' && (
              <div style={{ border: '1px solid #334155', borderRadius: '8px', padding: '20px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '14px' }}>L2 ANALYST</span>
                  <span style={{ color: '#f8fafc', fontSize: '18px', fontWeight: 'bold' }}>$350<span style={{ fontSize: '12px', color: '#64748b' }}>/mo</span></span>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>Unlimited queries · Full brief formats · Priority DeepSeek + Claude routing</div>
                <button
                  onClick={() => handleUpgrade(STRIPE_PRICE_L2)}
                  disabled={upgrading}
                  style={{ width: '100%', backgroundColor: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '6px', padding: '10px', fontWeight: 'bold', cursor: upgrading ? 'wait' : 'pointer', fontSize: '13px' }}
                >
                  {upgrading ? 'Redirecting...' : 'Subscribe — L2'}
                </button>
              </div>
            )}

            {/* L3 */}
            <div style={{ border: '1px solid #a855f7', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', color: '#a855f7', fontSize: '14px' }}>L3 ENTERPRISE</span>
                <span style={{ color: '#f8fafc', fontSize: '18px', fontWeight: 'bold' }}>$4,200<span style={{ fontSize: '12px', color: '#64748b' }}>/mo</span></span>
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>Everything in L2 · Custom KB · White-label briefs · Dedicated support</div>
              <button
                onClick={() => handleUpgrade(STRIPE_PRICE_L3)}
                disabled={upgrading}
                style={{ width: '100%', backgroundColor: '#a855f7', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px', fontWeight: 'bold', cursor: upgrading ? 'wait' : 'pointer', fontSize: '13px' }}
              >
                {upgrading ? 'Redirecting...' : 'Subscribe — L3'}
              </button>
            </div>

            <button
              onClick={() => setShowUpgrade(false)}
              style={{ width: '100%', background: 'none', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px', color: '#64748b', cursor: 'pointer', fontSize: '12px' }}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {messages.map((msg, index) => {
          const isInsightReport = msg.msgType === 'insight_report';
          const isHtml = msg.role === 'assistant' && msg.content.trim().startsWith('<div');
          // Show "Generate Report" button for L2/L3 on standard text responses only
          const showReportBtn = msg.role === 'assistant' && !isHtml && !isInsightReport
            && (tier === 'l2' || tier === 'l3') && msg.content.length > 100;
          return (
            <div key={index} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: isInsightReport ? '98%' : '85%',
              backgroundColor: msg.role === 'user' ? '#1e293b' : '#0f172a',
              border: `1px solid ${msg.role === 'user' ? '#334155' : '#1e293b'}`,
              borderRadius: '8px',
              padding: isInsightReport ? '0' : '16px 20px',
              fontSize: '13px',
              lineHeight: '1.6',
              overflow: 'hidden',
              flexShrink: 0,
              textAlign: 'left',
            }}>
              {!isInsightReport && (
                <div style={{ fontSize: '10px', color: msg.role === 'user' ? '#38bdf8' : '#a855f7', marginBottom: '10px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
                  {msg.role === 'user' ? '> QUERY' : '> NEXUS'}
                </div>
              )}
              {msg.role === 'assistant'
                ? isHtml
                  ? (
                    <>
                      <div dangerouslySetInnerHTML={{ __html: msg.content }} style={{ fontFamily: 'Georgia, serif', textAlign: 'left' }} />
                      {isInsightReport && (
                        <div style={{ padding: '14px 20px', borderTop: '1px solid #1e293b', display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#0b0f19' }}>
                          <button
                            onClick={() => downloadPDF(msg.content)}
                            style={{ background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 18px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'ui-monospace, monospace' }}
                          >
                            ↓ Download PDF
                          </button>
                          <span style={{ fontSize: '11px', color: '#475569' }}>Report saved — download or ask a follow-up to refine</span>
                        </div>
                      )}
                    </>
                  )
                  : (
                    <>
                      <div>{renderMarkdown(normalise(msg.content))}</div>
                      {showReportBtn && (
                        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #1e293b' }}>
                          <button
                            onClick={() => handleGenerateReport(msg.content)}
                            disabled={loading}
                            style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#38bdf8', border: '1px solid #334155', borderRadius: '4px', padding: '6px 14px', fontSize: '11px', fontWeight: 'bold', cursor: loading ? 'wait' : 'pointer', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.05em' }}
                          >
                            📄 Generate Report
                          </button>
                          <span style={{ marginLeft: '10px', fontSize: '10px', color: '#475569' }}>Expand into full institutional PDF report</span>
                        </div>
                      )}
                    </>
                  )
                : <div style={{ color: '#e2e8f0' }}>{msg.content}</div>
              }
            </div>
          );
        })}

        {loading && (
          <div style={{ alignSelf: 'flex-start', backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Loader2 size={16} className="loader-spin" style={{ color: '#a855f7' }} />
            <span style={{ color: '#64748b', fontSize: '12px' }}>Processing intelligence...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} style={{ padding: '16px 20px', borderTop: '1px solid #1e293b', backgroundColor: '#0f172a' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            placeholder="Ask a supply chain question..."
            style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '6px', padding: '12px 16px', color: '#f8fafc', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{ backgroundColor: loading || !input.trim() ? '#1e293b' : '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '6px', padding: '0 20px', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}
          >
            <Send size={15} />
          </button>
        </div>
      </form>

      <style>{`
        .loader-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0b0f19; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      `}</style>
    </div>
  );
}

// ─── Guest chat (unauthenticated — 1 free query then sign-in modal) ──────────

function GuestChat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "### USINO NEXUS INTELLIGENCE SYSTEM\n\n**SYSTEM STATUS:** READY\n\nWelcome to NEXUS. Try one free query — no sign-up required."
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestQueryUsed, setGuestQueryUsed] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false); // true = not closeable
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    // Second query attempt — require sign-in
    if (guestQueryUsed) {
      setSignInRequired(true);
      setShowSignIn(true);
      return;
    }

    const userPrompt = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userPrompt }]);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/v1/research/guest-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt, task_type: 'standard' })
      });

      if (response.status === 429) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "### FREE PREVIEW LIMIT REACHED\n\nSign in to continue querying USINO NEXUS."
        }]);
        setGuestQueryUsed(true);
        setSignInRequired(true);
        setShowSignIn(true);
        setLoading(false);
        return;
      }

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiReply = '';
      let messageAdded = false;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).replace(/\\n/g, '\n');
          if (data === '[COMPLETE]') { setLoading(false); continue; }
          if (data.startsWith('[ERROR]')) {
            setMessages(prev => [...prev, { role: 'assistant', content: `### ERROR\n${data}` }]);
            setLoading(false);
            return;
          }
          aiReply += data;
          if (!messageAdded) {
            setMessages(prev => [...prev, { role: 'assistant', content: aiReply }]);
            messageAdded = true;
          } else {
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], content: aiReply };
              return updated;
            });
          }
        }
      }

      // Query done — show sign-in modal (closeable)
      setGuestQueryUsed(true);
      setSignInRequired(false);
      setShowSignIn(true);

    } catch (error) {
      console.error('Guest query error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: `### ERROR\n${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0b0f19', color: '#e2e8f0', fontFamily: 'ui-monospace, monospace' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={18} style={{ color: '#38bdf8' }} />
          <span style={{ fontWeight: 'bold', letterSpacing: '0.05em' }}>USINO NEXUS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#22c55e', fontSize: '12px' }}>● Live</span>
          <span style={{ fontSize: '10px', color: '#64748b', border: '1px solid #1e293b', borderRadius: '3px', padding: '2px 7px' }}>GUEST PREVIEW</span>
          <button
            onClick={() => { setSignInRequired(false); setShowSignIn(true); }}
            style={{ background: 'linear-gradient(135deg, #38bdf8, #a855f7)', border: 'none', borderRadius: '4px', padding: '4px 12px', color: '#0f172a', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
          >
            Sign In
          </button>
        </div>
      </div>

      {/* Free query banner */}
      {!guestQueryUsed && (
        <div style={{ backgroundColor: '#0c1a2e', borderBottom: '1px solid #1e3a5f', padding: '8px 20px', fontSize: '11px', color: '#38bdf8', letterSpacing: '0.05em', textAlign: 'center' }}>
          Try 1 free query — no account needed. Sign in for full access.
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {messages.map((msg, index) => (
          <div key={index} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            backgroundColor: msg.role === 'user' ? '#1e293b' : '#0f172a',
            border: `1px solid ${msg.role === 'user' ? '#334155' : '#1e293b'}`,
            borderRadius: '8px',
            padding: '16px 20px',
            fontSize: '13px',
            lineHeight: '1.6',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '10px', color: msg.role === 'user' ? '#38bdf8' : '#a855f7', marginBottom: '10px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
              {msg.role === 'user' ? '> QUERY' : '> NEXUS'}
            </div>
            {msg.role === 'assistant'
              ? msg.content.trim().startsWith('<div')
                ? <div dangerouslySetInnerHTML={{ __html: msg.content }} style={{ fontFamily: 'sans-serif' }} />
                : <div>{renderMarkdown(normalise(msg.content))}</div>
              : <div style={{ color: '#e2e8f0' }}>{msg.content}</div>
            }
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Loader2 size={16} className="loader-spin" style={{ color: '#a855f7' }} />
            <span style={{ color: '#64748b', fontSize: '12px' }}>Processing intelligence...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} style={{ padding: '16px 20px', borderTop: '1px solid #1e293b', backgroundColor: '#0f172a' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            placeholder={guestQueryUsed ? "Sign in to continue querying..." : "Try a free supply chain query..."}
            style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '6px', padding: '12px 16px', color: '#f8fafc', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{ backgroundColor: loading || !input.trim() ? '#1e293b' : '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '6px', padding: '0 20px', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}
          >
            <Send size={15} />
          </button>
        </div>
      </form>

      {/* Sign-in modal */}
      {showSignIn && (
        <SignInModal onClose={signInRequired ? null : () => setShowSignIn(false)} />
      )}

      <style>{`
        .loader-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0b0f19; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      `}</style>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <SignedOut>
        <GuestChat />
      </SignedOut>
      <SignedIn>
        <NexusChat />
      </SignedIn>
    </ClerkProvider>
  );
}
