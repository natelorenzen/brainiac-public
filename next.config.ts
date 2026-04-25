import type { NextConfig } from 'next'

const config: NextConfig = {
  serverExternalPackages: ['@sparticuz/chromium-min', 'puppeteer-core'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default config
