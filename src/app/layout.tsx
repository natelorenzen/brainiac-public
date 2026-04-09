import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Brainiac — Brain Activation Analysis for Creatives',
  description:
    'Upload a thumbnail or connect your Meta Ads account. Brainiac runs Meta FAIR\'s TRIBE v2 brain encoding model and shows which neural regions activate in response to your creative.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans bg-gray-950 text-white antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
