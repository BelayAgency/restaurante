'use client';

import dynamic from 'next/dynamic';
import { Esqueleto } from '@/components/carga';

// Konva necesita el canvas del navegador: en el servidor no hay nada que dibujar.
export const LienzoPlanoDinamico = dynamic(() => import('./lienzo-plano').then((m) => m.LienzoPlano), {
  ssr: false,
  loading: () => <Esqueleto className="h-[520px] w-full" />,
});
