import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ProveedorToasts } from '@/components/toast';
import './globals.css';

const inter = Inter({ variable: '--fuente-interfaz', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Restaurante',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Corre antes del primer pintado: si esperara a React, el tema oscuro
// aparecería después de un destello claro.
const scriptTema = `try{var t=localStorage.getItem('belay-tema')||'sistema';if(t==='oscuro'||(t==='sistema'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function LayoutRaiz({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-AR" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body>
        <ProveedorToasts>{children}</ProveedorToasts>
      </body>
    </html>
  );
}
