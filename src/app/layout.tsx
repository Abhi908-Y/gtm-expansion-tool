import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const body = Inter({ subsets: ['latin'], variable: '--font-body' });
const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'] });

export const metadata: Metadata = {
  title: 'GTM Expansion Tool',
  description: 'Decide which countries to enter first. Every score is traced to a public source, and every claim about a company carries a quote.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>
        <header className="topbar">
          <div className="in">
            <Link href="/" className="brand"><span className="mark" aria-hidden="true" />GTM Expansion</Link>
            <div className="row" style={{ gap: 8 }}><Link href="/vobiz" className="btn sm ghost">Vobiz AI</Link><Link href="/#start" className="btn sm">New plan</Link></div>
          </div>
        </header>
        {children}
        <footer className="site">Figures come from the IMF, Eurostat, Microsoft AI Diffusion, EF and public company pages. Check the source link on any number before you rely on it.</footer>
      </body>
    </html>
  );
}
