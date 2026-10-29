'use client';

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CampoNumero } from '@/components/campo-numero';
import { useToast } from '@/components/toast';
import { Tarjeta, TituloSeccion } from '@/components/ui';
import { ACCIONES_AUTORIZABLES, LISTA_ACCIONES, type AccionAutorizable, type ReglasAutorizacion } from '@/dominio/autorizaciones';
import { NOMBRE_ROL, ROLES, type Rol } from '@/dominio/roles';
import { centavosDesdeTexto, textoDesdeCentavos } from '@/lib/formato';
import type { Umbrales } from '@/servidor/control';
import { accionGuardarConfiguracion } from '../acciones';

interface Configuracion {
  motivos: { id: string; accion: AccionAutorizable; texto: string }[];
  reglas: ReglasAutorizacion;
  umbrales: Umbrales;
}

const entero = (texto: string) => Number(texto.replace(/\D/g, '') || 0);

export function EditorControl({ inicial }: { inicial: Configuracion }) {
  const toast = useToast();
  const [reglas, setReglas] = useState(inicial.reglas);
  const [motivos, setMotivos] = useState(inicial.motivos.map((m) => ({ ...m, clave: m.id, id: m.id as string | null })));
  const [u, setU] = useState({
    minutosMesaAbierta: String(inicial.umbrales.minutosMesaAbierta),
    porcentajeDescuento: String(inicial.umbrales.porcentajeDescuento),
    diferenciaCaja: textoDesdeCentavos(inicial.umbrales.diferenciaCajaCentavos),
    diferenciaConteo: textoDesdeCentavos(inicial.umbrales.diferenciaConteoCentavos),
    horaApertura: String(inicial.umbrales.horaApertura),
    horaCierre: String(inicial.umbrales.horaCierre),
  });
  const [guardando, iniciar] = useTransition();

  function alternarRol(accion: AccionAutorizable, rol: Rol) {
    const actuales = reglas[accion];
    setReglas({ ...reglas, [accion]: actuales.includes(rol) ? actuales.filter((r) => r !== rol) : [...actuales, rol] });
  }

  function guardar() {
    iniciar(async () => {
      const resultado = await accionGuardarConfiguracion({
        reglas,
        motivos: motivos.map((m) => ({ id: m.id, accion: m.accion, texto: m.texto })),
        umbrales: {
          minutosMesaAbierta: entero(u.minutosMesaAbierta),
          porcentajeDescuento: entero(u.porcentajeDescuento),
          diferenciaCajaCentavos: centavosDesdeTexto(u.diferenciaCaja || '0') ?? 0,
          diferenciaConteoCentavos: centavosDesdeTexto(u.diferenciaConteo || '0') ?? 0,
          horaApertura: Math.min(23, entero(u.horaApertura)),
          horaCierre: Math.min(23, entero(u.horaCierre)),
        },
      });
      if (resultado.ok) toast.exito('Configuración guardada', 'Los dispositivos la toman en la próxima sincronización.');
      else toast.error(resultado.error);
    });
  }

  // Quién autoriza: soporte no opera el salón, y cocina no autoriza nada.
  const rolesQueAutorizan = ROLES.filter((r) => r !== 'cocina');

  return (
    <>
      <TituloSeccion
        descripcion="Qué necesita el PIN de un encargado, quién puede darlo, con qué motivos, y cuándo avisar."
        accion={
          <Boton variante="primario" onClick={guardar} cargando={guardando}>
            Guardar
          </Boton>
        }
      >
        Configuración de control
      </TituloSeccion>

      <div className="flex flex-col gap-4">
        {LISTA_ACCIONES.map((accion) => (
          <Tarjeta key={accion}>
            <p className="mb-3 text-sm font-medium text-tinta">{ACCIONES_AUTORIZABLES[accion]}</p>
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
              <span className="text-xs text-tinta-tenue">Autorizan:</span>
              {rolesQueAutorizan.map((rol) => (
                <label key={rol} className="flex items-center gap-1.5 text-sm text-tinta">
                  <input type="checkbox" className="accent-[var(--color-acento)]" checked={reglas[accion].includes(rol)} onChange={() => alternarRol(accion, rol)} />
                  {NOMBRE_ROL[rol]}
                </label>
              ))}
            </div>
            <p className="mb-1 text-xs text-tinta-tenue">Motivos</p>
            <div className="flex flex-col gap-2">
              {motivos
                .filter((m) => m.accion === accion)
                .map((m) => (
                  <div key={m.clave} className="flex items-center gap-2">
                    <input
                      className="campo min-w-0 flex-1"
                      aria-label="Motivo"
                      value={m.texto}
                      onChange={(e) => setMotivos(motivos.map((x) => (x.clave === m.clave ? { ...x, texto: e.target.value } : x)))}
                      maxLength={80}
                    />
                    <Boton variante="fantasma" tamano="sm" soloIcono aria-label="Quitar motivo" onClick={() => setMotivos(motivos.filter((x) => x.clave !== m.clave))}>
                      <X size={14} strokeWidth={1.5} />
                    </Boton>
                  </div>
                ))}
            </div>
            <Boton
              variante="fantasma"
              tamano="sm"
              className="mt-2"
              onClick={() => setMotivos([...motivos, { clave: crypto.randomUUID(), id: null, accion, texto: '' }])}
            >
              <Plus size={14} strokeWidth={1.5} /> Motivo
            </Boton>
          </Tarjeta>
        ))}

        <Tarjeta>
          <p className="mb-3 text-sm font-medium text-tinta">Alertas</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoNumero etiqueta="Cuenta abierta más de (minutos)" valor={u.minutosMesaAbierta} alCambiar={(v) => setU({ ...u, minutosMesaAbierta: v })} decimales={0} placeholder="0" />
            <CampoNumero etiqueta="Descuento mayor a (%)" valor={u.porcentajeDescuento} alCambiar={(v) => setU({ ...u, porcentajeDescuento: v })} decimales={0} placeholder="0" />
            <CampoNumero etiqueta="Diferencia de caja mayor a" valor={u.diferenciaCaja} alCambiar={(v) => setU({ ...u, diferenciaCaja: v })} decimales={2} prefijo="$" placeholder="0" />
            <CampoNumero etiqueta="Diferencia de conteo mayor a" valor={u.diferenciaConteo} alCambiar={(v) => setU({ ...u, diferenciaConteo: v })} decimales={2} prefijo="$" placeholder="0" />
            <CampoNumero etiqueta="El local abre a las (hora)" valor={u.horaApertura} alCambiar={(v) => setU({ ...u, horaApertura: v })} decimales={0} placeholder="0" />
            <CampoNumero
              etiqueta="Cierra a las (hora)"
              ayuda="Si cierra pasada la medianoche, poné la hora del día siguiente: 2 son las 2 de la mañana."
              valor={u.horaCierre}
              alCambiar={(v) => setU({ ...u, horaCierre: v })}
              decimales={0}
              placeholder="0"
            />
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
