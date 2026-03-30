import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flage Protocol — Dashboard',
  description: 'Real-time monitoring for the Flage AI arbitrage protocol on 0G',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
