import type { NextConfig } from 'next'

const config: NextConfig = {
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/analyze/webpage/capture': ['./node_modules/@sparticuz/chromium/**/*'],
  },
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
