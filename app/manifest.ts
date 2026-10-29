import type { MetadataRoute } from 'next';
import { NOMBRE_SISTEMA } from '@/lib/marca';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOMBRE_SISTEMA,
    short_name: NOMBRE_SISTEMA,
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F4EF',
    theme_color: '#F5F4EF',
    lang: 'es-AR',
    icons: [{ src: '/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
