'use client';

import type { TEEInfo } from '@/lib/types';
import { formatAddress } from '@/lib/vault';

interface TEEStatusProps {
  info: TEEInfo | null;
  teeKey: string;
}

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0, fontSize: 11 }}>{label}</span>
      <span style={{
        fontSize: 11,
        textAlign: 'right',
        wordBreak: 'break-all',
        fontFamily: mono ? 'var(--font)' : 'inherit',
      }}>
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
      border: `1px solid ${active ? '#166534' : 'var(--border)'}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          TEE Enclave
        </span>
        <span style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
          background: active ? '#14532d' : '#1a0a0a',
          color: active ? 'var(--green)' : 'var(--muted)',
          border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`,
        }}>
          {info ? (active ? 'ACTIVE' : 'INACTIVE') : 'UNKNOWN'}
        </span>
      </div>

      <div style={{ padding: '4px 16px 12px' }}>
        {!teeKey ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
            Set NEXT_PUBLIC_TEE_KEY to monitor enclave
          </div>
        ) : info ? (
          <>
            <Row label="Signing Key" value={formatAddress(info.signingAddress)} />
            <Row label="TDX Report" value={info.tdxReportHash.slice(0, 18) + '…'} />
            <Row label="NVIDIA Report" value={info.nvidiaReportHash.slice(0, 18) + '…'} />
            <Row
              label="Registered"
              value={`Block #${info.registeredAt.toLocaleString()}`}
              mono={false}
            />
            <Row
              label="Hardware"
              value="Intel TDX + NVIDIA H100"
              mono={false}
            />
          </>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
            Loading…
          </div>
        )}
      </div>

      {/* Proof of Inference indicator */}
      {active && (
        <div style={{
          margin: '0 16px 16px',
          padding: '10px 12px',
          background: '#0a1a0a',
          border: '1px solid #166534',
          borderRadius: 6,
          fontSize: 11,
          color: 'var(--green)',
        }}>
          Proof-of-Inference: ENABLED
          <br />
          <span style={{ color: 'var(--muted)' }}>
            All trades signed inside the sealed enclave
          </span>
        </div>
      )}
    </div>
  );
}
