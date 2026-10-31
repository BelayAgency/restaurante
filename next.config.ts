import type { NextConfig } from 'next';

// En el Dockerfile llega como build-arg con el SHA del commit; en Vercel, su propia variable.
// El cartel de nueva versión compara este valor contra /api/version, y el service worker
// nombra su caché con él: si quedara fijo, nadie saldría nunca de la versión vieja.
const idBuild = process.env.ID_BUILD ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Traen archivos propios (fuentes, wasm): se cargan como vienen, sin pasar por el bundler.
  serverExternalPackages: ['@react-pdf/renderer', 'exceljs', '@electric-sql/pglite'],
  // La base de la demo y los archivos de PGlite (wasm y datos de Postgres) se leen del disco
  // en tiempo de ejecución: sin esto, Vercel no los copia a la función.
  outputFileTracingIncludes: { '/**': ['./demo/base.tar.gz', './node_modules/@electric-sql/pglite/dist/**'] },
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
