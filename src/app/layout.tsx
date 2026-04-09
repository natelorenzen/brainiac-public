import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Brainiac',
  description: 'TODO: fill in description',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  )
}
