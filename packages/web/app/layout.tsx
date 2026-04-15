import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Noto_Sans_SC } from 'next/font/google';
import './globals.css';

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-snow-display',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-snow-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Snow',
  description: 'Snow — 有温度的 AI 陪伴助手',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#081018',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${cormorantGaramond.variable} ${notoSansSC.variable}`}>
      <body className="min-h-dvh bg-snow-bg text-snow-text antialiased">
        {children}
      </body>
    </html>
  );
}
