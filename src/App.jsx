import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ArrowUp, LogOut, Zap, FileText, Download, X, Sparkles, Mail } from 'lucide-react';
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

// Beta: not charging yet. Stripe products live only in the sandbox, so every
// checkout path is disabled and replaced with an access request by email.
// Flip to false once live Stripe products exist and billing is switched on.
const BETA_MODE = true;

const TIER_LABELS = { l1: 'Free', l2: 'Analyst', l3: 'Enterprise' };

const TIER_TABLE = [
  { key: 'l1', name: 'L1 Free', allowance: '3 queries per day', detail: 'Sector and macro level analysis. No company names or tickers.' },
  { key: 'l2', name: 'L2 Analyst', allowance: '100 queries per month', detail: 'Listed companies named with tickers, figures and capacity data.' },
  { key: 'l3', name: 'L3 Enterprise', allowance: '250 queries per month', detail: 'Everything in L2 plus non-listed firms, custom knowledge base and scorecard citations.' },
];

const TIER_COLORS = {
  l1: { fg: '#52525b', bg: '#f4f4f5', border: '#e4e4e7' },
  l2: { fg: '#1d4ed8', bg: '#eff4ff', border: '#c7d7fe' },
  l3: { fg: '#6d28d9', bg: '#f5f0ff', border: '#ddd0fe' },
};

const COLUMN = 768;

const SUGGESTIONS = [
  {
    title: 'Humanoid robotics',
    prompt: 'Map the humanoid robotics supply chain — actuators, harmonic drives, rare earth magnets. Where are the bottlenecks?',
  },
  {
    title: 'Co-packaged optics',
    prompt: 'How is the co-packaged optics ramp reshaping the optical transceiver supply chain, and who benefits?',
  },
  {
    title: 'Advanced packaging',
    prompt: 'Current state of advanced packaging capacity — CoWoS, HBM, substrates. Where are the constraints?',
  },
  {
    title: 'Energy',
    prompt: 'How is data centre power demand reshaping grid equipment supply — transformers, turbines, cabling?',
  },
  {
    title: 'Space and satellite',
    prompt: 'Who supplies the satellite manufacturing base — launch capacity, components, ground segment?',
  },
  {
    title: 'China plus one',
    prompt: 'Which China plus one destinations are absorbing the most manufacturing shift, and what is the bottleneck?',
  },
];

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
    if (match[2]) parts.push(<strong key={idx++} style={{ color: '#18181b', fontWeight: 600 }}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={idx++} style={{ color: '#3f3f46' }}>{match[3]}</em>);
    else if (match[4]) parts.push(
      <code key={idx++} style={{ background: '#f4f4f5', border: '1px solid #e7e7ea', padding: '1px 5px', borderRadius: '4px', fontSize: '13px', fontFamily: 'var(--mono)', color: '#1d4ed8' }}>{match[4]}</code>
    );
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
      const content = trimmed.replace(/^#{1,3}\s+/, '');
      const sizes = { 1: '21px', 2: '17px', 3: '15px' };
      elements.push(
        <div key={i} style={{
          fontWeight: 600,
          fontSize: sizes[level],
          color: '#18181b',
          letterSpacing: '-0.01em',
          margin: level === 1 ? '4px 0 14px' : '24px 0 8px',
          textAlign: 'left',
        }}>
          {content}
        </div>
      );
    } else if (trimmed.startsWith('Market intelligence only.')) {
      const parts = trimmed.split(/\.\s+(?=USINO)/);
      elements.push(
        <div key={i} style={{ marginTop: '24px', paddingTop: '14px', borderTop: '1px solid #e7e7ea', fontSize: '12px', color: '#a1a1aa', textAlign: 'left' }}>
          {parts.map((p, j) => <div key={j}>{p}{j < parts.length - 1 ? '.' : ''}</div>)}
        </div>
      );
    } else if (trimmed === '---') {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid #e7e7ea', margin: '20px 0' }} />);
    } else if (trimmed.startsWith('**') && trimmed.endsWith('**') && SECTION_LABELS.some(s => trimmed.includes(s))) {
      const label = trimmed.replace(/\*\*/g, '');
      elements.push(
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '26px 0 10px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.09em', color: '#2563eb', textTransform: 'uppercase' }}>{label}</span>
          <div style={{ flex: 1, height: '1px', background: '#e7e7ea' }} />
        </div>
      );
    } else if (trimmed.startsWith('**[HEADLINE]**') || trimmed.startsWith('**[')) {
      const headline = trimmed.replace(/^\*\*\[HEADLINE\]\*\*\s*—?\s*/, '').replace(/\*\*/g, '');
      elements.push(
        <div key={i} style={{ fontSize: '19px', fontWeight: 600, color: '#18181b', lineHeight: 1.4, letterSpacing: '-0.015em', margin: '4px 0 18px' }}>
          {headline}
        </div>
      );
    } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableRows.push(lines[i].trim());
        i++;
      }
      const dataRows = tableRows.filter(r => !/^\|[\s\-|:]+\|$/.test(r));
      const isHeader = dataRows.length > 0;
      elements.push(
        <div key={`t-${i}`} style={{ border: '1px solid #e7e7ea', borderRadius: '10px', overflow: 'hidden', margin: '12px 0' }}>
          {dataRows.map((row, ri) => {
            const segs = row.split('|');
            const cells = segs.map(c => c.trim()).filter((_, ci) => ci > 0 && ci < segs.length - 1);
            const head = ri === 0 && isHeader;
            return (
              <div key={ri} style={{
                display: 'flex',
                gap: '14px',
                padding: '9px 14px',
                borderBottom: ri < dataRows.length - 1 ? '1px solid #f1f1f3' : 'none',
                background: head ? '#fafafa' : '#fff',
                alignItems: 'baseline',
              }}>
                <span style={{ fontWeight: 600, color: head ? '#52525b' : '#1d4ed8', fontSize: '13px', minWidth: '100px', fontFamily: 'var(--mono)' }}>{cells[0]}</span>
                {cells[1] && <span style={{ color: head ? '#52525b' : '#3f3f46', fontSize: '13px', minWidth: '130px', fontWeight: head ? 600 : 400 }}>{cells[1]}</span>}
                {cells[2] && <span style={{ color: head ? '#52525b' : '#71717a', fontSize: '13px', flex: 1, fontWeight: head ? 600 : 400 }}>{cells[2]}</span>}
              </div>
            );
          })}
        </div>
      );
      continue;
    } else if (trimmed.match(/^[A-Z0-9.]{2,12}\s*\|/) && !trimmed.startsWith('|')) {
      const parts = trimmed.split('|').map(p => p.trim());
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '14px', padding: '8px 0', borderBottom: '1px solid #f1f1f3', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 600, color: '#1d4ed8', fontSize: '13px', minWidth: '90px', fontFamily: 'var(--mono)' }}>{parts[0]}</span>
          <span style={{ color: '#3f3f46', fontSize: '13px', minWidth: '150px' }}>{parts[1]}</span>
          <span style={{ color: '#71717a', fontSize: '13px', flex: 1 }}>{parts[2]}</span>
        </div>
      );
    } else if (trimmed.match(/^[A-Z]{1,6}\s*\(/) && trimmed.includes('—')) {
      const tickerLines = trimmed.split(/\.\s*[-–—]\s*(?=[A-Z]{1,6}\s*\()/)
        .map(s => s.trim()).filter(Boolean);
      tickerLines.forEach((tl, ti) => {
        const m = tl.match(/^(.+?\))\s*[-–—]\s*(.+)$/);
        const ticker = m ? m[1].trim() : tl;
        const rationale = m ? m[2].trim() : '';
        elements.push(
          <div key={`${i}-${ti}`} style={{ display: 'flex', gap: '12px', margin: '6px 0', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600, color: '#15803d', fontSize: '13px', minWidth: '140px', fontFamily: 'var(--mono)' }}>{ticker}</span>
            {rationale && <span style={{ color: '#3f3f46', fontSize: '14px' }}>{rationale}</span>}
          </div>
        );
      });
    } else if (trimmed.match(/^[-•]\s/)) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '10px', margin: '6px 0' }}>
          <span style={{ color: '#2563eb', flexShrink: 0, fontSize: '14px', lineHeight: '1.7' }}>•</span>
          <span style={{ color: '#3f3f46', fontSize: '14.5px', lineHeight: 1.7 }}>{inline(trimmed.slice(2))}</span>
        </div>
      );
    } else if (trimmed === '**' || trimmed === '*') {
      // stray markdown artifacts — skip
    } else if (trimmed === '') {
      elements.push(<div key={i} style={{ height: '10px' }} />);
    } else {
      elements.push(
        <p key={i} style={{ margin: '6px 0', color: '#3f3f46', lineHeight: 1.75, fontSize: '14.5px', textAlign: 'left' }}>
          {inline(line)}
        </p>
      );
    }
    i++;
  }
  return elements;
}

// Split the compliance disclaimer off the end of a response so it can be
// rendered after the report call-to-action rather than before it.
function splitDisclaimer(text) {
  const m =
    text.match(/\n\s*(This response is market intelligence[\s\S]*)$/) ||
    text.match(/\n\s*(Market intelligence only\.[\s\S]*)$/);
  if (!m) return [text, null];
  return [text.slice(0, m.index).trimEnd(), m[1].trim()];
}

function Disclaimer({ text }) {
  return (
    <div style={{
      marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #e7e7ea',
      fontSize: '12px', color: '#a1a1aa', lineHeight: 1.6, textAlign: 'left',
    }}>
      {text}
    </div>
  );
}

function ReportCTA({ onClick, disabled }) {
  return (
    <div style={{
      marginTop: '18px', padding: '14px 16px', background: '#fbfcff',
      border: '1px solid #c7d7fe', borderRadius: '12px', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 200, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '14px', color: '#18181b' }}>
          Generate PDF report for full details?
        </div>
        <div style={{ fontSize: '13px', color: '#71717a', marginTop: '2px', lineHeight: 1.5 }}>
          Expands this brief into a full institutional report with risk register and watchlist.
        </div>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          background: '#2563eb', color: '#fff', border: 'none', borderRadius: '9px',
          padding: '9px 15px', fontSize: '13.5px', fontWeight: 600, flexShrink: 0,
          cursor: disabled ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '7px',
        }}
      >
        <FileText size={15} /> Generate report
      </button>
    </div>
  );
}

// ─── Clerk appearance ─────────────────────────────────────────────────────────

const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: '#2563eb',
    colorText: '#18181b',
    colorTextSecondary: '#71717a',
    colorBackground: '#ffffff',
    colorInputBackground: '#ffffff',
    borderRadius: '10px',
    fontFamily: 'var(--sans)',
  },
  elements: {
    card: { boxShadow: '0 12px 32px rgba(16,24,40,0.12)', border: '1px solid #e7e7ea', borderRadius: '16px' },
    headerTitle: { fontSize: '19px', fontWeight: 600 },
    headerSubtitle: { color: '#71717a' },
    formButtonPrimary: { backgroundColor: '#2563eb', fontSize: '14px', fontWeight: 600, textTransform: 'none' },
    footerActionLink: { color: '#2563eb', fontWeight: 500 },
    socialButtonsBlockButton: { border: '1px solid #e7e7ea' },
  },
};

// ─── Shared pieces ────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
      <div style={{
        width: 26, height: 26, borderRadius: 7,
        background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 11.5L6 6.5L9.5 9.5L14 3.5" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span style={{ fontWeight: 600, fontSize: '15px', letterSpacing: '-0.01em', color: '#18181b' }}>
        USINO AI <span style={{ color: '#71717a', fontWeight: 500 }}>Nexus</span>
      </span>
    </div>
  );
}

function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { fg: '#52525b', bg: '#f4f4f5', border: '#e4e4e7' },
    blue: TIER_COLORS.l2,
    violet: TIER_COLORS.l3,
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      fontSize: '12px', fontWeight: 600, color: t.fg, background: t.bg,
      border: `1px solid ${t.border}`, borderRadius: '999px', padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function TypingDots() {
  return (
    <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0 8px' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        {[0, 1, 2].map(n => (
          <span key={n} className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb', display: 'block' }} />
        ))}
      </div>
      <span style={{ color: '#a1a1aa', fontSize: '13.5px' }}>Analysing…</span>
    </div>
  );
}

function EmptyState({ heading, sub, onPick }) {
  return (
    <div className="fade-up" style={{ padding: '48px 0 8px' }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px',
      }}>
        <Sparkles size={20} color="#fff" />
      </div>
      <div style={{
        fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: '#2563eb', marginBottom: '10px',
      }}>
        AI Supply Chain Intelligence
      </div>
      <h1 style={{ fontSize: '27px', fontWeight: 600, letterSpacing: '-0.025em', color: '#18181b', margin: '0 0 8px' }}>
        {heading}
      </h1>
      <p style={{ color: '#71717a', fontSize: '15.5px', margin: '0 0 30px', maxWidth: 520, lineHeight: 1.6 }}>
        {sub}
      </p>

      <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '12px' }}>
        Start with
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
        {SUGGESTIONS.map(s => (
          <button
            key={s.title}
            className="suggest-card"
            onClick={() => onPick(s.prompt)}
            style={{
              textAlign: 'left', background: '#fff', border: '1px solid #e7e7ea',
              borderRadius: '12px', padding: '14px 16px', cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#18181b', marginBottom: '3px' }}>{s.title}</div>
            <div style={{ fontSize: '13px', color: '#71717a', lineHeight: 1.5 }}>{s.prompt}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({ value, onChange, onSubmit, disabled, placeholder, hint }) {
  const taRef = useRef(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [value]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  return (
    <div style={{ borderTop: '1px solid #e7e7ea', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', padding: '14px 24px 18px' }}>
      <form onSubmit={onSubmit} style={{ maxWidth: COLUMN, margin: '0 auto' }}>
        <div
          className="composer"
          style={{
            display: 'flex', alignItems: 'flex-end', gap: '10px',
            border: '1px solid #d4d4d8', borderRadius: '14px',
            padding: '10px 10px 10px 16px', background: '#fff',
            boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
            transition: 'border-color .15s ease, box-shadow .15s ease',
          }}
        >
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKey}
            disabled={disabled}
            placeholder={placeholder}
            style={{
              flex: 1, border: 'none', outline: 'none', resize: 'none',
              fontSize: '15px', lineHeight: 1.6, color: '#18181b',
              background: 'transparent', padding: '4px 0', maxHeight: 180,
            }}
          />
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            aria-label="Send"
            style={{
              width: 34, height: 34, borderRadius: '10px', border: 'none', flexShrink: 0,
              background: disabled || !value.trim() ? '#e4e4e7' : '#2563eb',
              color: disabled || !value.trim() ? '#a1a1aa' : '#fff',
              cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background .15s ease',
            }}
          >
            {disabled ? <Loader2 size={16} className="loader-spin" /> : <ArrowUp size={17} />}
          </button>
        </div>
        <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '8px', textAlign: 'center' }}>
          {hint}
        </div>
        <div style={{
          fontSize: '12px', color: '#a1a1aa', marginTop: '6px', textAlign: 'center',
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        }}>
          <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: '#a1a1aa', textDecoration: 'none' }}>Terms</a>
          <span aria-hidden="true">·</span>
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: '#a1a1aa', textDecoration: 'none' }}>Privacy</a>
          <span aria-hidden="true">·</span>
          <a href="/refunds.html" target="_blank" rel="noopener noreferrer" style={{ color: '#a1a1aa', textDecoration: 'none' }}>Refunds</a>
          <span aria-hidden="true">·</span>
          <span>© 2026 USINO AI PTE. LTD.</span>
        </div>
      </form>
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div className="fade-up" style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        maxWidth: '86%', background: '#f4f4f5', border: '1px solid #e7e7ea',
        borderRadius: '14px 14px 4px 14px', padding: '10px 15px',
        fontSize: '14.5px', lineHeight: 1.6, color: '#18181b', whiteSpace: 'pre-wrap',
      }}>
        {children}
      </div>
    </div>
  );
}

function AssistantBlock({ children }) {
  return (
    <div className="fade-up" style={{ textAlign: 'left' }}>
      {children}
    </div>
  );
}

// ─── Sign-in modal overlay ────────────────────────────────────────────────────

function SignInModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(24,24,27,0.45)',
      backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 100, padding: '20px',
    }}>
      <div style={{ position: 'relative' }}>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: -14, right: -14, background: '#fff',
              border: '1px solid #e7e7ea', borderRadius: '50%', width: 30, height: 30,
              color: '#71717a', cursor: 'pointer', zIndex: 101, display: 'flex',
              alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(16,24,40,0.1)',
            }}
          >
            <X size={15} />
          </button>
        )}
        <div style={{ marginBottom: '14px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: '#71717a' }}>
            You've used your free preview query
          </div>
        </div>
        <SignIn appearance={CLERK_APPEARANCE} />
      </div>
    </div>
  );
}

// ─── Upgrade modal ────────────────────────────────────────────────────────────

function PlanCard({ name, price, per, blurb, cta, onClick, disabled, accent, subtle }) {
  return (
    <div style={{
      border: `1px solid ${accent ? '#c7d7fe' : '#e7e7ea'}`,
      background: accent ? '#fbfcff' : '#fff',
      borderRadius: '12px', padding: '18px', marginBottom: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontWeight: 600, fontSize: '14.5px', color: accent ? '#1d4ed8' : '#18181b' }}>{name}</span>
        <span style={{ fontSize: '19px', fontWeight: 600, color: '#18181b', letterSpacing: '-0.02em' }}>
          {price}{per && <span style={{ fontSize: '13px', color: '#a1a1aa', fontWeight: 400 }}>{per}</span>}
        </span>
      </div>
      <div style={{ fontSize: '13.5px', color: '#71717a', marginBottom: '14px', lineHeight: 1.55 }}>{blurb}</div>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: '100%', borderRadius: '9px', padding: '10px', fontWeight: 600, fontSize: '14px',
          cursor: disabled ? 'wait' : 'pointer',
          border: subtle ? '1px solid #e4e4e7' : 'none',
          background: subtle ? '#fff' : accent ? '#2563eb' : '#7c3aed',
          color: subtle ? '#3f3f46' : '#fff',
        }}
      >
        {disabled ? 'Redirecting…' : cta}
      </button>
    </div>
  );
}

const requestInputStyle = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #e4e4e7', borderRadius: '9px',
  padding: '10px 12px', fontSize: '14px', fontFamily: 'inherit', color: '#18181b',
  marginBottom: '8px', outline: 'none',
};

function BetaAccessModal({ tier, user, getToken, onClose }) {
  const email = user?.primaryEmailAddress?.emailAddress || '';

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [selectedTier, setSelectedTier] = useState(tier === 'l2' ? 'l3' : 'l2');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Add your name so we know who this is.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const trimmedName = fullName.trim();
      const spaceIdx = trimmedName.indexOf(' ');
      const first_name = spaceIdx === -1 ? trimmedName : trimmedName.slice(0, spaceIdx);
      const last_name = spaceIdx === -1 ? '' : trimmedName.slice(spaceIdx + 1);

      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/v1/access-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          email,
          first_name,
          last_name,
          company,
          job_title: jobTitle,
          tier_requested: selectedTier,
          notes,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setSubmitted(true);
    } catch (err) {
      console.error('Access request error:', err);
      setError("Couldn't send that — try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(24,24,27,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px',
    }}>
      <div style={{
        background: '#fff', border: '1px solid #e7e7ea', borderRadius: '16px',
        padding: '26px', maxWidth: 500, width: '100%',
        boxShadow: '0 20px 48px rgba(16,24,40,0.18)', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {submitted ? (
          <>
            <div style={{ fontSize: '19px', fontWeight: 600, color: '#18181b', letterSpacing: '-0.02em' }}>
              Request sent
            </div>
            <div style={{ fontSize: '14px', color: '#71717a', marginTop: '8px', marginBottom: '18px', lineHeight: 1.55 }}>
              We'll review it and follow up at {email}.
            </div>
            <button
              onClick={onClose}
              style={{
                width: '100%', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '9px',
                padding: '11px', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
              }}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '19px', fontWeight: 600, color: '#18181b', letterSpacing: '-0.02em' }}>
              Access tiers
            </div>
            <div style={{ fontSize: '14px', color: '#71717a', marginTop: '5px', marginBottom: '18px', lineHeight: 1.55 }}>
              USINO AI NEXUS is in invitation-only beta. Paid plans open later — for now, higher tiers are granted by request.
            </div>

            {TIER_TABLE.map(t => {
              const current = t.key === tier;
              return (
                <div key={t.key} style={{
                  border: `1px solid ${current ? '#c7d7fe' : '#e7e7ea'}`,
                  background: current ? '#fbfcff' : '#fff',
                  borderRadius: '12px', padding: '14px 16px', marginBottom: '10px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14.5px', color: current ? '#1d4ed8' : '#18181b' }}>
                      {t.name}
                    </span>
                    <span style={{ fontSize: '13px', color: '#71717a', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                      {t.allowance}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#71717a', marginTop: '4px', lineHeight: 1.55 }}>
                    {t.detail}
                  </div>
                  {current && (
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#1d4ed8', marginTop: '8px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      Your current tier
                    </div>
                  )}
                </div>
              );
            })}

            <form onSubmit={handleSubmit} style={{ marginTop: '16px', borderTop: '1px solid #f0f0f2', paddingTop: '16px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#18181b', marginBottom: '10px' }}>
                Request access
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                {['l2', 'l3'].map(k => {
                  const active = selectedTier === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedTier(k)}
                      style={{
                        flex: 1, padding: '9px', borderRadius: '9px', fontSize: '13.5px', fontWeight: 600,
                        border: `1px solid ${active ? '#2563eb' : '#e4e4e7'}`,
                        background: active ? '#eff4ff' : '#fff',
                        color: active ? '#1d4ed8' : '#52525b',
                        cursor: 'pointer',
                      }}
                    >
                      {TIER_LABELS[k]}
                    </button>
                  );
                })}
              </div>

              <input
                type="text" placeholder="Full name" value={fullName}
                onChange={e => setFullName(e.target.value)} style={requestInputStyle}
              />
              <input
                type="text" placeholder="Company" value={company}
                onChange={e => setCompany(e.target.value)} style={requestInputStyle}
              />
              <input
                type="text" placeholder="Job title" value={jobTitle}
                onChange={e => setJobTitle(e.target.value)} style={requestInputStyle}
              />
              <textarea
                placeholder="Anything else? (optional)" value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ ...requestInputStyle, minHeight: '60px', resize: 'vertical', marginBottom: '4px' }}
              />
              {error && (
                <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px', marginBottom: '4px' }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  width: '100%', background: '#2563eb', color: '#fff', borderRadius: '9px',
                  padding: '11px', fontWeight: 600, fontSize: '14px', border: 'none',
                  cursor: submitting ? 'wait' : 'pointer', marginTop: '10px',
                }}
              >
                <Mail size={15} /> {submitting ? 'Sending…' : `Request ${TIER_LABELS[selectedTier]} access`}
              </button>
            </form>

            <button
              onClick={onClose}
              className="btn-ghost"
              style={{
                width: '100%', background: 'none', border: 'none', borderRadius: '9px',
                padding: '9px', color: '#71717a', cursor: 'pointer', fontSize: '13.5px', marginTop: '6px',
              }}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function UpgradeModal({ tier, upgrading, onUpgrade, onTopup, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(24,24,27,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px',
    }}>
      <div style={{
        background: '#fff', border: '1px solid #e7e7ea', borderRadius: '16px',
        padding: '26px', maxWidth: 460, width: '100%',
        boxShadow: '0 20px 48px rgba(16,24,40,0.18)', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '19px', fontWeight: 600, color: '#18181b', letterSpacing: '-0.02em' }}>
            Expand your access
          </div>
          <div style={{ fontSize: '14px', color: '#71717a', marginTop: '5px', lineHeight: 1.55 }}>
            Full supply chain coverage, higher query limits, and priority routing.
          </div>
        </div>

        {tier === 'l1' && (
          <PlanCard
            name="Top up — Free tier" price="$10" blurb="+7 bonus queries. Raises your daily cap from 3 to 10."
            cta="Add queries" subtle disabled={upgrading}
            onClick={() => { onTopup(STRIPE_TOPUP_L1); onClose(); }}
          />
        )}

        {tier !== 'l2' && (
          <PlanCard
            name="L2 Analyst" price="$350" per="/mo" accent
            blurb="100 queries a month · full brief formats · priority model routing."
            cta="Subscribe" disabled={upgrading}
            onClick={() => onUpgrade(STRIPE_PRICE_L2)}
          />
        )}

        <PlanCard
          name="L3 Enterprise" price="$4,200" per="/mo"
          blurb="Everything in L2 · custom knowledge base · white-label briefs · dedicated support."
          cta="Subscribe" disabled={upgrading}
          onClick={() => onUpgrade(STRIPE_PRICE_L3)}
        />

        <button
          onClick={onClose}
          className="btn-ghost"
          style={{
            width: '100%', background: 'none', border: 'none', borderRadius: '9px',
            padding: '9px', color: '#71717a', cursor: 'pointer', fontSize: '13.5px', marginTop: '4px',
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function Banner({ tone, children, onClose }) {
  const tones = {
    green: { bg: '#f0fdf4', border: '#bbf7d0', fg: '#15803d' },
    blue: { bg: '#eff4ff', border: '#c7d7fe', fg: '#1d4ed8' },
  };
  const t = tones[tone];
  return (
    <div style={{
      background: t.bg, borderBottom: `1px solid ${t.border}`, padding: '9px 24px',
      display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px',
    }}>
      <span style={{ color: t.fg, fontSize: '13.5px', fontWeight: 500 }}>{children}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.fg, cursor: 'pointer', display: 'flex', padding: 0 }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Main chat (authenticated) ────────────────────────────────────────────────

function NexusChat() {
  const { getToken, signOut } = useAuth();
  const { user } = useUser();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [tier, setTier] = useState('l1');
  const [usage, setUsage] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const messagesEndRef = useRef(null);

  const downloadPDF = useCallback((htmlContent) => {
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>USINO.AI Insight Report</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { margin: 0; padding: 0; background: #fff; }
        @page { margin: 0.6in; size: A4; }
        .no-print { display: flex; padding: 14px 20px; background: #f4f4f5; gap: 10px; font-family: -apple-system, sans-serif; }
        @media print { .no-print { display: none !important; } }
        button { padding: 9px 20px; border: none; cursor: pointer; font-size: 13px; border-radius: 6px; }
      </style>
    </head><body>
      <div class="no-print">
        <button onclick="window.print()" style="background:#2563eb;color:#fff;">Print / Save as PDF</button>
        <button onclick="window.close()" style="background:#e4e4e7;color:#3f3f46;">Close</button>
        <span style="margin-left:8px;font-size:12px;color:#71717a;align-self:center;">Use Chrome → Print → Save as PDF for best results</span>
      </div>
      ${htmlContent}
    </body></html>`);
    win.document.close();
  }, []);

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

  const submitPrompt = async (rawValue) => {
    const rawInput = (rawValue ?? input).trim();
    if (!rawInput || loading) return;

    const { task_type, prompt: userPrompt } = parseCommand(rawInput);
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
          content: BETA_MODE
            ? `### Query limit reached\n\nYou've used all **${err.detail?.limit} queries** for this period.\n\nRequest higher access to continue.`
            : `### Query limit reached\n\nYou've used all **${err.detail?.limit} queries** for this period.\n\nTop up or upgrade to continue.`
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
            setMessages(prev => [...prev, { role: 'assistant', content: `### Error\n${data}` }]);
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
      setMessages(prev => [...prev, { role: 'assistant', content: `### Error\n${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    submitPrompt();
  };

  const usageText = () => {
    if (!usage) return null;
    if (tier === 'l3') return `${usage.used}/${usage.limit} used this month`;
    const period = tier === 'l1' ? 'today' : 'this month';
    return `${usage.remaining}/${usage.limit} left ${period}`;
  };

  const topup = tier === 'l1'
    ? { price: STRIPE_TOPUP_L1, label: '+7 queries' }
    : tier === 'l2'
      ? { price: STRIPE_TOPUP_L2, label: '+25 queries' }
      : { price: STRIPE_TOPUP_L3, label: '+50 queries' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 56, borderBottom: '1px solid #e7e7ea',
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', flexShrink: 0,
      }}>
        <Logo />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {usage && (
            <span style={{ fontSize: '13px', color: usage.remaining === 0 ? '#dc2626' : '#71717a' }}>
              {usageText()}
              {usage.bonus_queries > 0 && <span style={{ color: '#16a34a' }}> · +{usage.bonus_queries} bonus</span>}
            </span>
          )}
          <Pill tone={tier === 'l2' ? 'blue' : tier === 'l3' ? 'violet' : 'neutral'}>
            {TIER_LABELS[tier]}
          </Pill>
          {!BETA_MODE && (
            <button
              onClick={() => handleTopup(topup.price)}
              disabled={upgrading}
              className="btn-ghost"
              style={{
                background: 'none', border: '1px solid #e4e4e7', borderRadius: '8px',
                padding: '5px 11px', color: '#52525b', fontSize: '13px', fontWeight: 500,
                cursor: upgrading ? 'wait' : 'pointer',
              }}
            >
              {topup.label}
            </button>
          )}
          {(tier === 'l1' || tier === 'l2') && (
            <button
              onClick={() => setShowUpgrade(true)}
              style={{
                background: '#2563eb', border: 'none', borderRadius: '8px', padding: '6px 13px',
                color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {BETA_MODE ? <><Mail size={13} /> Request access</> : <><Zap size={13} /> Upgrade</>}
            </button>
          )}
          <div style={{ width: 1, height: 20, background: '#e7e7ea', margin: '0 2px' }} />
          {user && (
            <span style={{ color: '#a1a1aa', fontSize: '13px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.primaryEmailAddress?.emailAddress}
            </span>
          )}
          <button
            onClick={() => signOut()}
            className="btn-ghost"
            aria-label="Sign out"
            style={{
              background: 'none', border: '1px solid #e4e4e7', borderRadius: '8px',
              padding: '6px 8px', color: '#71717a', cursor: 'pointer', display: 'flex',
            }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {showSuccessBanner && (
        <Banner tone="green" onClose={() => setShowSuccessBanner(false)}>
          Subscription activated — your tier will update within seconds.
        </Banner>
      )}
      {showTopupBanner && (
        <Banner tone="blue" onClose={() => setShowTopupBanner(false)}>
          Top-up processed — bonus queries added to your account.
        </Banner>
      )}

      {showUpgrade && (
        BETA_MODE ? (
          <BetaAccessModal
            tier={tier}
            user={user}
            getToken={getToken}
            onClose={() => setShowUpgrade(false)}
          />
        ) : (
          <UpgradeModal
            tier={tier} upgrading={upgrading}
            onUpgrade={handleUpgrade} onTopup={handleTopup}
            onClose={() => setShowUpgrade(false)}
          />
        )
      )}

      {/* Conversation */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
        <div style={{ maxWidth: COLUMN, margin: '0 auto', paddingBottom: '32px' }}>
          {messages.length === 0 && !loading && (
            <EmptyState
              heading={`Welcome back${user?.firstName ? `, ${user.firstName}` : ''}`}
              sub="Ask anything about frontier technology supply chains — semiconductors, robotics, optics, energy — and Nexus returns an institutional-grade brief."
              onPick={(p) => submitPrompt(p)}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingTop: messages.length ? '28px' : 0 }}>
            {messages.map((msg, index) => {
              const isInsightReport = msg.msgType === 'insight_report';
              const isHtml = msg.role === 'assistant' && msg.content.trim().startsWith('<div');
              const showReportBtn = msg.role === 'assistant' && !isHtml && !isInsightReport
                && (tier === 'l2' || tier === 'l3') && msg.content.length > 100;

              if (msg.role === 'user') {
                return <UserBubble key={index}>{msg.content}</UserBubble>;
              }

              return (
                <AssistantBlock key={index}>
                  {isHtml ? (
                    <div style={{ border: '1px solid #e7e7ea', borderRadius: '14px', overflow: 'hidden' }}>
                      <div dangerouslySetInnerHTML={{ __html: msg.content }} style={{ fontFamily: 'Georgia, serif', textAlign: 'left', padding: isInsightReport ? 0 : '18px' }} />
                      {isInsightReport && (
                        <div style={{ padding: '13px 18px', borderTop: '1px solid #e7e7ea', display: 'flex', gap: '12px', alignItems: 'center', background: '#fafafa' }}>
                          <button
                            onClick={() => downloadPDF(msg.content)}
                            style={{
                              background: '#18181b', color: '#fff', border: 'none', borderRadius: '8px',
                              padding: '8px 15px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: '7px',
                            }}
                          >
                            <Download size={14} /> Download PDF
                          </button>
                          <span style={{ fontSize: '13px', color: '#a1a1aa' }}>Report saved — ask a follow-up to refine</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    (() => {
                      const [body, disclaimer] = splitDisclaimer(msg.content);
                      return (
                        <>
                          <div>{renderMarkdown(normalise(body))}</div>
                          {showReportBtn && (
                            <ReportCTA
                              onClick={() => handleGenerateReport(msg.content)}
                              disabled={loading}
                            />
                          )}
                          {disclaimer && <Disclaimer text={disclaimer} />}
                        </>
                      );
                    })()
                  )}
                </AssistantBlock>
              );
            })}

            {loading && <TypingDots />}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        disabled={loading}
        placeholder="Ask a supply chain question…"
        hint="Enter to send · Shift + Enter for a new line · /brief and /weekly for report formats"
      />
    </div>
  );
}

// ─── Guest chat (unauthenticated) ─────────────────────────────────────────────

function GuestChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestQueryUsed, setGuestQueryUsed] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const submitPrompt = async (rawValue) => {
    const userPrompt = (rawValue ?? input).trim();
    if (!userPrompt || loading) return;

    if (guestQueryUsed) {
      setSignInRequired(true);
      setShowSignIn(true);
      return;
    }

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
          content: "### Free preview limit reached\n\nSign in to continue querying USINO AI Nexus."
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
            setMessages(prev => [...prev, { role: 'assistant', content: `### Error\n${data}` }]);
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

      setGuestQueryUsed(true);
      setSignInRequired(false);
      setShowSignIn(true);

    } catch (error) {
      console.error('Guest query error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: `### Error\n${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    submitPrompt();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 56, borderBottom: '1px solid #e7e7ea',
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', flexShrink: 0,
      }}>
        <Logo />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Pill>Guest preview</Pill>
          <button
            onClick={() => { setSignInRequired(false); setShowSignIn(true); }}
            style={{
              background: '#2563eb', border: 'none', borderRadius: '8px', padding: '6px 15px',
              color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
            }}
          >
            Sign in
          </button>
        </div>
      </header>

      {!guestQueryUsed && (
        <div style={{
          background: '#eff4ff', borderBottom: '1px solid #c7d7fe', padding: '9px 24px',
          fontSize: '13.5px', color: '#1d4ed8', textAlign: 'center', fontWeight: 500,
        }}>
          One free query — no account needed. Sign in for full access.
        </div>
      )}

      {/* Conversation */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
        <div style={{ maxWidth: COLUMN, margin: '0 auto', paddingBottom: '32px' }}>
          {messages.length === 0 && !loading && (
            <EmptyState
              heading="Ask anything about the AI supply chain"
              sub="Semiconductors, robotics, optics, energy, and the trade flows behind them. Your first query is free — no account needed."
              onPick={(p) => submitPrompt(p)}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingTop: messages.length ? '28px' : 0 }}>
            {messages.map((msg, index) =>
              msg.role === 'user' ? (
                <UserBubble key={index}>{msg.content}</UserBubble>
              ) : (
                <AssistantBlock key={index}>
                  {msg.content.trim().startsWith('<div')
                    ? <div dangerouslySetInnerHTML={{ __html: msg.content }} style={{ fontFamily: 'Georgia, serif' }} />
                    : (() => {
                      const [body, disclaimer] = splitDisclaimer(msg.content);
                      return (
                        <>
                          <div>{renderMarkdown(normalise(body))}</div>
                          {disclaimer && <Disclaimer text={disclaimer} />}
                        </>
                      );
                    })()}
                </AssistantBlock>
              )
            )}
            {loading && <TypingDots />}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        disabled={loading}
        placeholder={guestQueryUsed ? 'Sign in to continue querying…' : 'Try a free supply chain query…'}
        hint="Enter to send · Shift + Enter for a new line"
      />

      {showSignIn && (
        <SignInModal onClose={signInRequired ? null : () => setShowSignIn(false)} />
      )}
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
