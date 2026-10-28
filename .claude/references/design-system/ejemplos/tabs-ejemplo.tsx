'use client';

import { useState } from 'react';
import { CreditCard, ReceiptText, Settings } from 'lucide-react';
import { Tabs, PanelTab } from '@/components/tabs';
import { Tarjeta } from '@/components/ui';

/**
 * EJEMPLO — las pestañas armadas: la barra con fondo deslizante y debajo el
 * contenido de la activa. Para la variante con URL, ver el comentario de
 * `components/tabs.tsx`.
 */
export function EjemploTabs() {
  const [tab, setTab] = useState('resumen');

  return (
    <Tarjeta>
      <Tabs
        etiqueta="Secciones de facturación"
        valor={tab}
        alCambiar={setTab}
        opciones={[
          { valor: 'resumen', etiqueta: 'Resumen', icono: <ReceiptText size={14} strokeWidth={1.5} /> },
          { valor: 'cobros', etiqueta: 'Cobros', icono: <CreditCard size={14} strokeWidth={1.5} /> },
          { valor: 'ajustes', etiqueta: 'Ajustes', icono: <Settings size={14} strokeWidth={1.5} /> },
        ]}
      />

      <PanelTab valor="resumen" activo={tab}>Resumen del período.</PanelTab>
      <PanelTab valor="cobros" activo={tab}>Lista de cobros.</PanelTab>
      <PanelTab valor="ajustes" activo={tab}>Ajustes de facturación.</PanelTab>
    </Tarjeta>
  );
}
