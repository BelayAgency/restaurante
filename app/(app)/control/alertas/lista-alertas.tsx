'use client';

import { useTransition } from 'react';
import { BellRing, Check } from 'lucide-react';
import { Boton } from '@/components/boton';
import { useToast } from '@/components/toast';
import { EstadoVacio, Insignia, Tarjeta } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fechaHora, pesosDesdeCentavos } from '@/lib/formato';
import type { Alerta } from '@/servidor/control';
import { accionMarcarVista } from '../acciones';

export function ListaAlertas({ alertas }: { alertas: Alerta[] }) {
  const toast = useToast();
  const [ocupado, iniciar] = useTransition();
  const pendientes = alertas.filter((a) => !a.vista).length;

  if (!alertas.length) {
    return (
      <Tarjeta>
        <EstadoVacio icono={<BellRing size={28} strokeWidth={1.5} />} titulo="No hay alertas en este período" />
      </Tarjeta>
    );
  }

  return (
    <>
      {pendientes ? <p className="mb-3 text-sm text-tinta-suave">{pendientes === 1 ? '1 sin revisar' : `${pendientes} sin revisar`}</p> : null}
      <div className="flex flex-col gap-2">
        {alertas.map((a) => (
          <Tarjeta key={a.clave} padding={false} className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-3', a.vista && 'opacity-60')}>
            <div className="min-w-0">
              <p className="text-sm font-medium text-tinta">
                {a.titulo}
                {a.vista ? (
                  <Insignia tono="neutro" className="ml-2">
                    Vista
                  </Insignia>
                ) : null}
              </p>
              <p className="text-xs text-tinta-tenue">
                {fechaHora(a.momento)} · {a.detalle}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {a.montoCentavos !== null ? <span className="text-sm tabular-nums text-tinta">{pesosDesdeCentavos(a.montoCentavos)}</span> : null}
              {!a.vista ? (
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  disabled={ocupado}
                  onClick={() =>
                    iniciar(async () => {
                      const resultado = await accionMarcarVista(a.clave);
                      if (!resultado.ok) toast.error(resultado.error);
                    })
                  }
                >
                  <Check size={13} strokeWidth={1.5} /> Vista
                </Boton>
              ) : null}
            </div>
          </Tarjeta>
        ))}
      </div>
    </>
  );
}
