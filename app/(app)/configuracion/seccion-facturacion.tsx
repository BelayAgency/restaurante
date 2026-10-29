'use client';

import { useEffect, useState, useTransition } from 'react';
import { Download } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CargandoFilas } from '@/components/carga';
import { FilaConfig, SeccionConfig } from '@/components/configuracion';
import { Aviso, EstadoVacio, Insignia, Mono, Tabla, Td, Th, type TonoInsignia } from '@/components/ui';
import { fechaCorta, nombrePeriodo, pesosDesdeCentavos } from '@/lib/formato';
import type { Cobro, Facturacion } from '@/servidor/facturacion';
import { accionFacturacion } from '../acciones';

const POR_PAGINA = 12;

const ESTADO_SERVICIO: Record<Facturacion['servicio']['estado'], { texto: string; tono: TonoInsignia }> = {
  al_dia: { texto: 'Al día', tono: 'exito' },
  pendiente: { texto: 'Pago pendiente', tono: 'alerta' },
  con_problema: { texto: 'Cobro con problema', tono: 'error' },
  sin_cobros: { texto: 'Todavía sin cobros', tono: 'neutro' },
};

const ESTADO_COBRO: Record<Cobro['estado'], { texto: string; tono: TonoInsignia }> = {
  aprobado: { texto: 'Aprobado', tono: 'exito' },
  pendiente: { texto: 'Pendiente', tono: 'alerta' },
  rechazado: { texto: 'Rechazado', tono: 'error' },
  devuelto: { texto: 'Devuelto', tono: 'neutro' },
  contracargo: { texto: 'Contracargo', tono: 'error' },
  otro: { texto: 'Otro', tono: 'neutro' },
};

function dolares(centavos: number): string {
  return `US$ ${pesosDesdeCentavos(centavos).replace('$ ', '')}`;
}

export function SeccionFacturacion() {
  const [offset, setOffset] = useState(0);
  // `undefined` mientras carga, `null` si el panel no contestó.
  const [datos, setDatos] = useState<Facturacion | null>();
  const [cargando, iniciar] = useTransition();

  useEffect(() => {
    iniciar(async () => {
      const resultado = await accionFacturacion(offset);
      setDatos(resultado.ok ? resultado.datos : null);
    });
  }, [offset]);

  if (datos === undefined) return <CargandoFilas filas={6} />;

  if (datos === null) {
    // Nunca una lista vacía: se leería como "nunca te cobramos".
    return <Aviso tono="error">No pudimos traer el historial, probá en unos minutos.</Aviso>;
  }

  const { servicio, cobros, paginacion } = datos;
  const estado = ESTADO_SERVICIO[servicio.estado];

  return (
    <>
      <SeccionConfig titulo="Servicio">
        <FilaConfig rotulo="Estado">
          <Insignia tono={estado.tono}>{estado.texto}</Insignia>
        </FilaConfig>
        <FilaConfig rotulo="Abono mensual" descripcion="En dólares; en pesos al MEP del día del cobro.">
          <span className="text-sm text-tinta">
            {dolares(servicio.feeUsdCentavos)} · {pesosDesdeCentavos(servicio.montoArsCentavos)}
          </span>
        </FilaConfig>
        {servicio.proximoCobro ? (
          <FilaConfig rotulo="Próximo cobro">
            <span className="text-sm text-tinta">{fechaCorta(servicio.proximoCobro)}</span>
          </FilaConfig>
        ) : null}
      </SeccionConfig>

      <SeccionConfig titulo="Cobros">
        {cobros.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay cobros"
            detalle={servicio.proximoCobro ? `El primero es el ${fechaCorta(servicio.proximoCobro)}.` : undefined}
          />
        ) : (
          <div className={cargando ? 'opacity-60' : undefined}>
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th className="text-right">Monto</Th>
                  <Th>Estado</Th>
                  <Th>Pago MP</Th>
                  <Th>
                    <span className="sr-only">Comprobante</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {cobros.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <div>{fechaCorta(c.fecha)}</div>
                      <div className="text-xs text-tinta-tenue">{nombrePeriodo(c.periodo)}</div>
                    </Td>
                    <Td className="text-right tabular-nums">{pesosDesdeCentavos(c.montoArsCentavos)}</Td>
                    <Td>
                      <Insignia tono={ESTADO_COBRO[c.estado].tono}>{ESTADO_COBRO[c.estado].texto}</Insignia>
                    </Td>
                    <Td>{c.pagoMercadoPago ? <Mono>{c.pagoMercadoPago}</Mono> : '—'}</Td>
                    <Td className="text-right">
                      {c.comprobante ? (
                        <a
                          href={`/api/facturacion/${c.id}/comprobante`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-acento hover:underline"
                        >
                          <Download size={14} strokeWidth={1.5} /> PDF
                        </a>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
            {paginacion.total > POR_PAGINA ? (
              <div className="mt-3 flex justify-end gap-2">
                <Boton variante="secundario" tamano="sm" disabled={offset === 0 || cargando} onClick={() => setOffset(Math.max(0, offset - POR_PAGINA))}>
                  Más nuevos
                </Boton>
                <Boton variante="secundario" tamano="sm" disabled={!paginacion.hayMas || cargando} onClick={() => setOffset(offset + POR_PAGINA)}>
                  Más viejos
                </Boton>
              </div>
            ) : null}
          </div>
        )}
      </SeccionConfig>
    </>
  );
}
