'use client';

import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import { Ban, ExternalLink, Flag, FlagOff, Pencil } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CampoAdjunto, subirAdjunto } from '@/components/campo-adjunto';
import { Campo } from '@/components/campo';
import { CampoNumero } from '@/components/campo-numero';
import { CargandoFilas } from '@/components/carga';
import { MenuAcciones, type AccionMenu } from '@/components/menu-acciones';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { Aviso, FilaDato } from '@/components/ui';
import { datosCorreccion } from '@/dominio/compras';
import { puede } from '@/dominio/permisos';
import { formatearCantidad } from '@/dominio/stock';
import { centavosDesdeTexto, fechaCorta, fechaHora, pesosDesdeCentavos, textoDesdeCentavos } from '@/lib/formato';
import type { FichaFactura as Ficha } from '@/servidor/compras';
import { useSesion } from '../../sesion-cliente';
import { accionAnularFactura, accionCorregirFactura, accionFichaFactura, accionMarcarReclamo } from './acciones';
import { InsigniaEstado } from './estado-comprobante';
import { ModalAnular } from './modal-anular';

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-tinta-suave">{titulo}</h3>
      {children}
    </section>
  );
}

/** Lo que cambió en una corrección, contra lo que quedó después. */
function cambios(anterior: Record<string, unknown>, despues: Record<string, unknown>, proveedores: Map<string, string>): string[] {
  const textos: string[] = [];
  if (anterior.numeroFactura !== despues.numeroFactura) textos.push(`número ${String(anterior.numeroFactura)}`);
  if (anterior.fecha !== despues.fecha) textos.push(`fecha ${fechaCorta(String(anterior.fecha))}`);
  if (anterior.totalCentavos !== despues.totalCentavos) textos.push(`total ${pesosDesdeCentavos(Number(anterior.totalCentavos))}`);
  if (anterior.proveedorId !== despues.proveedorId) textos.push(`proveedor ${proveedores.get(String(anterior.proveedorId)) ?? '—'}`);
  if ((anterior.observacion ?? null) !== (despues.observacion ?? null)) textos.push('observación');
  return textos;
}

/**
 * La ficha de un comprobante: cuánto se pagó y con qué, qué trajo, la foto y
 * quién lo cargó y lo corrigió. Corregir se hace acá mismo, sin salir.
 */
export function FichaFactura({ id, proveedores, alCerrar }: { id: string; proveedores: { id: string; nombre: string }[]; alCerrar: () => void }) {
  const { usuario } = useSesion();
  const toast = useToast();
  const [ficha, setFicha] = useState<Ficha | null>();
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [, iniciar] = useTransition();

  const cargar = useCallback(() => {
    iniciar(async () => {
      const resultado = await accionFichaFactura(id);
      setFicha(resultado.ok ? resultado.datos : null);
    });
  }, [id]);

  useEffect(cargar, [cargar]);

  const nombres = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const titulo = ficha ? `${ficha.tipo === 'factura' ? 'Factura' : 'Nota de crédito'} ${ficha.numeroFactura}` : 'Comprobante';

  const acciones: AccionMenu[] = ficha && !ficha.anulada
    ? [
        { texto: 'Corregir', icono: <Pencil size={15} strokeWidth={1.5} />, alElegir: () => setCorrigiendo(true) },
        ...(ficha.tipo === 'factura'
          ? [
              {
                texto: ficha.enReclamo ? 'Quitar el reclamo' : 'Marcar en reclamo',
                icono: ficha.enReclamo ? <FlagOff size={15} strokeWidth={1.5} /> : <Flag size={15} strokeWidth={1.5} />,
                alElegir: () =>
                  iniciar(async () => {
                    const resultado = await accionMarcarReclamo(id, !ficha.enReclamo);
                    if (!resultado.ok) return toast.error(resultado.error);
                    toast.exito(ficha.enReclamo ? 'Reclamo resuelto' : 'Factura en reclamo', ficha.enReclamo ? undefined : 'Los pagos no la cancelan hasta que se resuelva.');
                    cargar();
                  }),
              },
            ]
          : []),
        ...(puede(usuario, 'compras.anular') ? [{ texto: 'Anular', icono: <Ban size={15} strokeWidth={1.5} />, alElegir: () => setAnulando(true) }] : []),
      ]
    : [];

  return (
    <>
      <Modal
        abierto
        alCerrar={alCerrar}
        titulo={titulo}
        descripcion={ficha ? `${ficha.proveedor} · ${fechaCorta(ficha.fecha)}` : undefined}
        acciones={acciones.length && !corrigiendo ? <MenuAcciones acciones={acciones} /> : null}
      >
        {ficha === undefined ? (
          <div className="modal-cuerpo">
            <CargandoFilas filas={5} />
          </div>
        ) : ficha === null ? (
          <div className="modal-cuerpo">
            <Aviso tono="error">No pudimos traer el comprobante, probá de nuevo.</Aviso>
          </div>
        ) : corrigiendo ? (
          <FormCorreccion
            ficha={ficha}
            proveedores={proveedores}
            alCancelar={() => setCorrigiendo(false)}
            alGuardar={() => {
              setCorrigiendo(false);
              cargar();
            }}
          />
        ) : (
          <div className="modal-cuerpo flex flex-col gap-6">
            {ficha.anulada ? (
              <Aviso tono="neutro" titulo="Anulado">
                {ficha.anulada.por}, {fechaHora(ficha.anulada.en)}: {ficha.anulada.motivo}
              </Aviso>
            ) : null}
            {ficha.enReclamo && !ficha.anulada ? <Aviso tono="error">En reclamo: los pagos no la cancelan hasta que se resuelva.</Aviso> : null}

            <dl>
              <FilaDato etiqueta="Estado">
                <InsigniaEstado estado={ficha.estado} />
              </FilaDato>
              <FilaDato etiqueta="Total">
                <span className="tabular-nums">{pesosDesdeCentavos(ficha.totalCentavos)}</span>
              </FilaDato>
              {ficha.tipo === 'factura' && !ficha.anulada ? (
                <>
                  <FilaDato etiqueta="Pagado">
                    <span className="tabular-nums">{pesosDesdeCentavos(ficha.pagadoCentavos)}</span>
                  </FilaDato>
                  <FilaDato etiqueta="Saldo">
                    <span className="tabular-nums">{pesosDesdeCentavos(ficha.saldoCentavos)}</span>
                  </FilaDato>
                </>
              ) : null}
              {ficha.observacion ? <FilaDato etiqueta="Observación">{ficha.observacion}</FilaDato> : null}
            </dl>

            <Seccion titulo="Comprobante">
              {ficha.tieneAdjunto ? (
                <a href={`/api/adjuntos/compra/${ficha.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-acento hover:underline">
                  <ExternalLink size={14} strokeWidth={1.5} /> Ver la foto o el PDF
                </a>
              ) : ficha.anulada ? (
                <p className="text-sm text-tinta-tenue">Sin foto</p>
              ) : (
                <CampoAdjunto
                  etiqueta="Sin foto todavía"
                  alCambiar={(archivo) =>
                    archivo &&
                    iniciar(async () => {
                      const fallo = await subirAdjunto('compra', ficha.id, archivo);
                      if (fallo) return toast.error(fallo);
                      toast.exito('Foto guardada');
                      cargar();
                    })
                  }
                />
              )}
            </Seccion>

            {ficha.cubiertaPor.length ? (
              <Seccion titulo="Cubierta por">
                <ul className="text-sm">
                  {ficha.cubiertaPor.map((c, i) => (
                    <li key={i} className="flex justify-between gap-3 border-b border-borde/60 py-2 last:border-0">
                      <span className="text-tinta">
                        {c.detalle} <span className="text-tinta-tenue">· {fechaCorta(c.fecha)}</span>
                      </span>
                      <span className="tabular-nums">{pesosDesdeCentavos(c.importeCentavos)}</span>
                    </li>
                  ))}
                </ul>
              </Seccion>
            ) : null}

            {ficha.lineas.length ? (
              <Seccion titulo={`Insumos${ficha.deposito ? ` · entraron a ${ficha.deposito}` : ''}`}>
                <ul className="text-sm">
                  {ficha.lineas.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3 border-b border-borde/60 py-2 last:border-0">
                      <span className="text-tinta">
                        {l.nombre} <span className="text-tinta-tenue">· {formatearCantidad(l.cantidadBase, l.unidad)}</span>
                      </span>
                      <span className="tabular-nums">{pesosDesdeCentavos(l.costoCentavos)}</span>
                    </li>
                  ))}
                </ul>
              </Seccion>
            ) : null}

            <Seccion titulo="Historial">
              <ul className="flex flex-col gap-1.5 text-sm text-tinta-suave">
                <li>
                  {ficha.registradaPor ? `Cargada por ${ficha.registradaPor}` : 'Importada del sistema anterior'}, {fechaHora(ficha.registradaEn)}
                </li>
                {ficha.revisiones.map((r, i) => {
                  const despues = ficha.revisiones[i + 1]?.anterior ?? { proveedorId: ficha.proveedorId, numeroFactura: ficha.numeroFactura, fecha: ficha.fecha, totalCentavos: ficha.totalCentavos, observacion: ficha.observacion };
                  const cambio = cambios(r.anterior, despues, nombres);
                  return (
                    <li key={r.revision}>
                      Corregida por {r.por}, {fechaHora(r.en)}
                      {cambio.length ? <span className="text-tinta-tenue"> · antes: {cambio.join(', ')}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </Seccion>
          </div>
        )}
      </Modal>

      {anulando && ficha ? (
        <ModalAnular
          titulo={`Anular ${titulo.toLowerCase()}`}
          aviso={ficha.lineas.length ? 'La mercadería que entró con ella sale del depósito. Queda registrado quién la anuló y por qué.' : 'Deja de contar en la cuenta del proveedor. Queda registrado quién la anuló y por qué.'}
          alCerrar={() => setAnulando(false)}
          alAnular={async (motivo) => {
            const resultado = await accionAnularFactura(id, motivo);
            if (!resultado.ok) return resultado.error;
            toast.exito('Comprobante anulado');
            setAnulando(false);
            cargar();
            return null;
          }}
        />
      ) : null}
    </>
  );
}

function FormCorreccion({ ficha, proveedores, alCancelar, alGuardar }: { ficha: Ficha; proveedores: { id: string; nombre: string }[]; alCancelar: () => void; alGuardar: () => void }) {
  const toast = useToast();
  const [proveedorId, setProveedorId] = useState<string | null>(ficha.proveedorId);
  const [numero, setNumero] = useState(ficha.numeroFactura);
  const [fecha, setFecha] = useState(ficha.fecha);
  const [total, setTotal] = useState(textoDesdeCentavos(ficha.totalCentavos));
  const [observacion, setObservacion] = useState(ficha.observacion ?? '');
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  function guardar() {
    const datos = datosCorreccion.safeParse({ proveedorId, numeroFactura: numero, fecha, totalCentavos: centavosDesdeTexto(total || '0') ?? 0, observacion: observacion.trim() || null });
    if (!datos.success) return setError(datos.error.issues[0]?.message);
    iniciar(async () => {
      const resultado = await accionCorregirFactura(ficha.id, datos.data);
      if (!resultado.ok) return setError(resultado.error);
      toast.exito('Corrección guardada', 'La versión anterior quedó en el historial.');
      alGuardar();
    });
  }

  return (
    <>
      <div className="modal-cuerpo flex flex-col gap-4">
        <div>
          <label className="etiqueta-campo">Proveedor</label>
          <Selector opciones={proveedores.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} valor={proveedorId} alElegir={setProveedorId} buscador />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          <Campo etiqueta="Número" value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={40} required />
        </div>
        <CampoNumero etiqueta="Importe total" valor={total} alCambiar={setTotal} decimales={2} prefijo="$" placeholder="0" />
        <Campo etiqueta="Observación (opcional)" value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={300} />
        {ficha.lineas.length ? <p className="text-sm text-tinta-tenue">Los insumos y el stock no cambian: si la mercadería vino distinta, se corrige con una baja o una compra aparte.</p> : null}
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={guardar} cargando={guardando}>
          Guardar corrección
        </Boton>
      </footer>
    </>
  );
}
