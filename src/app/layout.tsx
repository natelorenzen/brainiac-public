import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Adforge — Static Ad Intelligence',
  description:
    'Upload static ad creatives. Adforge runs BERG fMRI brain activation analysis and Claude Sonnet vision to score copy, behavioral economics, neuroscience, and visual dimensions — and learns from your historical winners and losers.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-gray-950 text-white antialiased">
        {children}
      </body>
    </html>
  )
}
