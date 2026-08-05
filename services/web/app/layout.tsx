import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';

import { Providers } from './providers';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const space = Space_Grotesk({ subsets: ['latin'], variable: '--font-space' });

export const metadata: Metadata = {
  title: 'ANIMA — The Intelligence of Who You Are',
  description:
    'An AI Digital Identity Intelligence Platform. Your identity, your memory, your growth — one evolving digital twin.',
  keywords: ['AI identity', 'digital twin', 'knowledge graph', 'memory', 'agents'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${space.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
