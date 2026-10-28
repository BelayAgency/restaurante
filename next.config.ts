import type { NextConfig } from 'next';

// En el Dockerfile llega como build-arg con el SHA del commit; el cartel de
// nueva versión compara este valor contra /api/version.
const idBuild = process.env.ID_BUILD ?? 'dev';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  env: { NEXT_PUBLIC_ID_BUILD: idBuild },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
