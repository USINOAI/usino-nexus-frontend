import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Terminal, Cpu, Send } from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: "### USINO NEXUS INTELLIGENCE SYSTEM\n\n**SYSTEM STATUS:** READY\n\nWelcome to NEXUS. Enter a supply chain query to generate institutional-grade market intelligence." 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userPrompt = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userPrompt }]);
    setLoading(true);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/research/intelligence/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, task_type: "extraction" })
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiReply = '';
      let messageAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.replace('data: ', '').trim();
            
            if (data === '[COMPLETE]') {
              setLoading(false);
              continue;
            }
            
            if (data.startsWith('[ERROR]')) {
              setMessages((prev) => [...prev, { role: 'assistant', content: `### ERROR\n${data}` }]);
              setLoading(false);
              return;
            }

            aiReply += data;

            if (!messageAdded) {
              setMessages((prev) => [...prev, { role: 'assistant', content: aiReply }]);
              messageAdded = true;
            } else {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1].content = aiReply;
                return updated;
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("API Error:", error);
      setMessages((prev) => [...prev, { role: 'assistant', content: `### ERROR\n${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0b0f19', color: '#e2e8f0', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={18} style={{ color: '#38bdf8' }} />
          <span style={{ fontWeight: 'bold' }}>USINO NEXUS</span>
        </div>
        <span style={{ color: '#22c55e' }}>● Live</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {messages.map((msg, index) => (
          <div key={index} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            backgroundColor: msg.role === 'user' ? '#1e293b' : '#111827',
            borderRadius: '6px',
            padding: '16px 20px',
            fontSize: '14px',
            lineHeight: '1.6',
          }}>
            <div style={{ fontSize: '11px', color: msg.role === 'user' ? '#38bdf8' : '#a855f7', marginBottom: '6px', fontWeight: 'bold' }}>
              {msg.role === 'user' ? '> QUERY' : '> NEXUS'}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', backgroundColor: '#111827', borderRadius: '6px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Loader2 size={16} className="loader-spin" style={{ color: '#a855f7' }} />
            <span style={{ color: '#94a3b8' }}>Processing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} style={{ padding: '20px', borderTop: '1px solid #1e293b', backgroundColor: '#0f172a' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Query supply chain..."
            style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '6px', padding: '14px 18px', color: '#f8fafc', fontFamily: 'monospace', fontSize: '14px', outline: 'none' }}
          />
          <button type="submit" disabled={loading || !input.trim()} style={{ backgroundColor: loading || !input.trim() ? '#1e293b' : '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '6px', padding: '0 24px', cursor: 'pointer', fontWeight: 'bold' }}>
            <Send size={16} />
          </button>
        </div>
      </form>

      <style>{`
        .loader-spin { animation: spin 1s linear infinite; }
        @keyframes spin { 
          from { transform: rotate(0deg); } 
          to { transform: rotate(360deg); } 
        }
      `}</style>
    </div>
  );
}