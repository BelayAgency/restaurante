import type { NextConfig } from 'next';

// En el Dockerfile llega como build-arg con el SHA del commit; el cartel de
// nueva versión compara este valor contra /api/version.
const idBuild = process.env.ID_BUILD ?? 'dev';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Traen archivos propios (fuentes, wasm): se cargan como vienen, sin pasar por el bundler.
  serverExternalPackages: ['@react-pdf/renderer', 'exceljs'],
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
