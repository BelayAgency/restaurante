'use client';

import { useMemo } from 'react';
import { CATALOGO_VACIO, type Catalogo } from '@/dominio/catalogo';
import type { EventoNuevo } from '@/dominio/eventos';
import { reducirDispositivo } from '@/dominio/reductores/dispositivo';
import { reducirSalon, type EstadoSalon } from '@/dominio/reductores/salon';
import { baseLocal } from './base';
import { useConsultaLocal } from './consulta';

export interface DatosLocales {
  dispositivoId: string | null;
  catalogo: Catalogo;
  /** Confirmados en el orden del servidor y después la bandeja propia, en el orden en que se cargó. */
  eventos: EventoNuevo[];
  pendientes: number;
}

/** Todo lo que necesita la operación del salón, leído de la base del dispositivo. */
export function useDatosLocales(): DatosLocales | undefined {
  return useConsultaLocal(async () => {
    const [dispositivo, catalogo, confirmados, pendientes] = await Promise.all([
      baseLocal.ajustes.get('dispositivo'),
      baseLocal.catalogo.get('actual'),
      baseLocal.confirmados.orderBy('secuencia').toArray(),
      baseLocal.pendientes.orderBy('orden').toArray(),
    ]);
    return {
      dispositivoId: dispositivo?.valor ?? null,
      // Un catálogo guardado por una versión anterior puede no traer todo: lo que falta, vacío.
      catalogo: { ...CATALOGO_VACIO, ...catalogo?.valor },
      eventos: [...confirmados, ...pendientes.map((p) => p.evento)],
      pendientes: pendientes.length,
    };
  }, []);
}

export function useEstadoSalon(datos: DatosLocales | undefined): EstadoSalon | null {
  return useMemo(() => (datos ? reducirSalon(datos.eventos) : null), [datos]);
}

/** Quién opera este dispositivo: el último cambio de operador, o quien inició la sesión. */
export function useOperadorDe(datos: DatosLocales | undefined, porDefecto: string): string {
  return useMemo(() => {
    if (!datos?.dispositivoId) return porDefecto;
    const propios = datos.eventos.filter((e) => e.agregadoId === datos.dispositivoId);
    return reducirDispositivo(propios).operadorId ?? porDefecto;
  }, [datos, porDefecto]);
}
