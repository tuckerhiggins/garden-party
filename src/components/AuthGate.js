import React, { useState } from 'react';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO = '"Press Start 2P", monospace';

// Wraps any action. If role === 'guest', shows a sign-in prompt instead.
export function AuthGate({ role, signIn, children }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  if (role !== 'guest') return children;

  if (sent) {
    return (
      <div style={{ padding: '12px 0', fontSize: 13, color: '#907050', fontFamily: SERIF, fontStyle: 'italic' }}>
        Check your email for a sign-in link.
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 12, color: '#907050', fontFamily: SERIF, marginBottom: 8 }}>
        Sign in to tend this plant.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && email && (signIn(email), setSent(true))}
          placeholder="your@email.com"
          style={{
            flex: 1, padding: '6px 10px',
            border: '1px solid rgba(160,130,80,0.3)',
            borderRadius: 4, fontFamily: SERIF, fontSize: 13, background: '#faf6ee',
          }}
        />
        <button
          onClick={() => { if (email) { signIn(email); setSent(true); } }}
          style={{
            background: '#2a1808', border: 'none', borderRadius: 4,
            padding: '6px 12px', color: '#f0e4cc',
            fontFamily: MONO, fontSize: 7, cursor: 'pointer',
          }}>
          SIGN IN
        </button>
      </div>
    </div>
  );
}
