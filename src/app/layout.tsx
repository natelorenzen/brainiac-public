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
  title: 'Brainiac — Brain Activation Analysis for Creatives',
  description:
    "Upload a static ad image. Brainiac runs BERG fMRI brain activation analysis and Claude Sonnet vision to score your ad on neural engagement, CTA strength, emotional appeal, brand clarity, and visual hierarchy.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'light';if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})()`,
          }}
        />
      </head>
      <body className="bg-gray-950 text-white antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
