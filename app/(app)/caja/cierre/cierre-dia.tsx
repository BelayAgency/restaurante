'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { Aviso, EstadoVacio, Insignia, Metrica, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import type { ResumenDia } from '@/servidor/dia';
import { fechaHora, pesosDesdeCentavos } from '@/lib/formato';
import { accionCerrarDia } from './acciones';

// Un dispositivo que no habla hace más de esto puede tener cobros sin enviar.
const MINUTOS_SIN_CONTACTO = 10;

type Resumen = Omit<ResumenDia, 'dia'> & { dia: { id: string; abiertoEn: string; ultimoCierre: string | null } };

export function CierreDia({ resumen, nombres }: { resumen: Resumen; nombres: Record<string, string> }) {
  const toast = useToast();
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, iniciar] = useTransition();
  const [ahora] = useState(() => Date.now());

  const callados = resumen.dispositivos.filter((d) => !d.ultimoContacto || ahora - new Date(d.ultimoContacto).getTime() > MINUTOS_SIN_CONTACTO * 60_000);
  const bloqueos = [
    resumen.cuentasAbiertas > 0 ? `Hay ${resumen.cuentasAbiertas} cuentas abiertas.` : null,
    resumen.turnosAbiertos > 0 ? 'La caja sigue abierta: falta el arqueo.' : null,
  ].filter((b): b is string => b !== null);

  function cerrar() {
    iniciar(async () => {
      const resultado = await accionCerrarDia();
      setConfirmando(false);
      if (!resultado.ok) return toast.error(resultado.error);
      toast.exito('Día cerrado', 'Lo que llegue con hora de hoy queda marcado como posterior al cierre.');
      router.refresh();
    });
  }

  return (
    <>
      <TituloSeccion descripcion={`Día abierto desde ${fechaHora(resumen.dia.abiertoEn)}`}>Cierre del día</TituloSeccion>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta="Ventas" valor={pesosDesdeCentavos(resumen.ventasCentavos)} />
        <Metrica etiqueta="Propinas" valor={pesosDesdeCentavos(resumen.propinasCentavos)} />
        <Metrica etiqueta="Comensales" valor={String(resumen.comensales)} />
        <Metrica etiqueta="Cobros" valor={String(resumen.cobros)} />
      </div>

      <section className="mb-6">
        <TituloSeccion>Cajas del día</TituloSeccion>
        <Tarjeta>
          {resumen.turnos.length === 0 ? (
            <EstadoVacio titulo="Hoy no se abrió la caja" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Abrió</Th>
                  <Th>Cerró</Th>
                  <Th className="text-right">Esperado</Th>
                  <Th className="text-right">Declarado</Th>
                  <Th className="text-right">Diferencia</Th>
                </tr>
              </thead>
              <tbody>
                {resumen.turnos.map((t) => {
                  const esperado = t.filas.reduce((s, f) => s + f.esperadoCentavos, 0);
                  const declarado = t.filas.reduce((s, f) => s + (f.declaradoCentavos ?? 0), 0);
                  return (
                    <tr key={t.id}>
                      <Td>
                        {nombres[t.abiertoPor] ?? '—'}
                        <div className="text-xs text-tinta-tenue">{fechaHora(t.abiertoEn)}</div>
                      </Td>
                      <Td>{t.cerradoEn ? nombres[t.cerradoPor ?? ''] ?? '—' : <Insignia tono="alerta">Abierta</Insignia>}</Td>
                      <Td className="text-right tabular-nums">{pesosDesdeCentavos(esperado)}</Td>
                      <Td className="text-right tabular-nums">{t.cerradoEn ? pesosDesdeCentavos(declarado) : '—'}</Td>
                      <Td className="text-right tabular-nums">
                        {t.diferenciaCentavos === null ? (
                          '—'
                        ) : (
                          <Insignia tono={t.diferenciaCentavos === 0 ? 'exito' : 'error'}>{pesosDesdeCentavos(t.diferenciaCentavos)}</Insignia>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
      </section>

      {callados.length ? (
        <div className="mb-4">
          <Aviso tono="alerta" titulo="Dispositivos sin sincronizar">
            {callados.map((d) => `${d.nombre} (${d.ultimoContacto ? fechaHora(d.ultimoContacto) : 'nunca'})`).join(', ')}. Si tienen algo sin enviar, va a
            entrar en el día siguiente, marcado.
          </Aviso>
        </div>
      ) : null}

      {bloqueos.length ? (
        <Aviso tono="error">{bloqueos.join(' ')}</Aviso>
      ) : (
        <div>
          <Boton variante="primario" onClick={() => setConfirmando(true)}>
            Cerrar el día
          </Boton>
        </div>
      )}

      <Modal abierto={confirmando} alCerrar={() => setConfirmando(false)} titulo="Cerrar el día">
        <div className="modal-cuerpo">
          <p className="text-sm text-tinta-suave">Los totales quedan congelados. Lo que se opere a partir de ahora entra en el día siguiente.</p>
        </div>
        <div className="modal-pie">
          <Boton variante="secundario" onClick={() => setConfirmando(false)} disabled={cerrando}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={cerrar} cargando={cerrando}>
            Cerrar el día
          </Boton>
        </div>
      </Modal>
    </>
  );
}
