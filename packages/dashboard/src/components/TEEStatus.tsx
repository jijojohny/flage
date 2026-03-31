'use client';

import type { TEEInfo } from '@/lib/types';
import { formatAddress } from '@/lib/vault';

interface TEEStatusProps {
  info: TEEInfo | null;
  teeKey: string;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      padding: '9px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        color: 'var(--muted)',
        flexShrink: 0,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        {label}
      </span>
      <span style={{ fontSize: 11, textAlign: 'right', wordBreak: 'break-all', color: 'var(--accent)' }}>
        {value}
      </span>
    </div>
  );
}

export function TEEStatus({ info, teeKey }: TEEStatusProps) {
  const active = info?.active ?? false;

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: active ? 'var(--accent-dim)' : 'transparent',
      }}>
        <span style={{
          fontWeight: 800,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--accent)',
        }}>
          / TEE Enclave
        </span>
        <span style={{
          fontSize: 10,
          padding: '3px 10px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          background: active ? 'var(--accent)' : 'transparent',
          color: active ? '#000' : 'var(--muted)',
          border: active ? 'none' : '1px solid var(--border)',
        }}>
          {info ? (active ? 'ACTIVE' : 'INACTIVE') : 'UNKNOWN'}
        </span>
      </div>

      <div style={{ padding: '6px 18px 16px' }}>
        {!teeKey ? (
          <div className="empty-state" style={{ padding: '28px 0' }}>
            Set NEXT_PUBLIC_TEE_KEY<br />to monitor enclave
          </div>
        ) : info ? (
          <>
            <Row label="Signing Key"   value={formatAddress(info.signingAddress)} />
            <Row label="TDX Report"    value={info.tdxReportHash.slice(0, 18) + '…'} />
            <Row label="NVIDIA Report" value={info.nvidiaReportHash.slice(0, 18) + '…'} />
            <Row label="Registered"    value={`Block #${info.registeredAt.toLocaleString()}`} />
            <Row label="Hardware"      value="Intel TDX + NVIDIA H100" />
          </>
        ) : (
          <div className="empty-state" style={{ padding: '28px 0' }}>Loading…</div>
        )}
      </div>

      {active && (
        <div style={{
          margin: '0 18px 18px',
          padding: '12px 14px',
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          lineHeight: 1.9,
        }}>
          ✓ Proof-of-Inference: Enabled<br />
          <span style={{ color: 'var(--muted)' }}>All trades signed inside sealed enclave</span>
        </div>
      )}
    </div>
  );
}
