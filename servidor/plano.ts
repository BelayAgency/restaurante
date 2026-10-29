import 'server-only';
import { and, asc, eq, inArray, isNull, ne, notInArray } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { elementosPlano, sectores } from '@/db/esquema';
import type { ElementoPlano, SectorCatalogo } from '@/dominio/catalogo';
import { puede } from '@/dominio/permisos';
import { ErrorAcceso, ErrorDominio, type UsuarioSesion } from '@/lib/sesion';
import { auditar } from './auditoria';
import { sinArchivado } from './filas';

function exigirPlano(actor: UsuarioSesion) {
  if (!puede(actor, 'plano.administrar')) throw new ErrorAcceso(403, 'Sólo el dueño edita el plano');
}

export async function leerPlano(actor: UsuarioSesion): Promise<{ sectores: SectorCatalogo[]; elementos: ElementoPlano[] }> {
  exigirPlano(actor);
  const [filasSectores, filasElementos] = await Promise.all([
    db.select().from(sectores).where(isNull(sectores.archivadoEn)).orderBy(asc(sectores.orden), asc(sectores.nombre)),
    db.select().from(elementosPlano).where(isNull(elementosPlano.archivadoEn)),
  ]);
  return {
    sectores: filasSectores.map(sinArchivado),
    elementos: filasElementos.map(sinArchivado),
  };
}

export interface DatosSector {
  id: string;
  nuevo: boolean;
  nombre: string;
  orden: number;
  ancho: number;
  alto: number;
  elementos: Omit<ElementoPlano, 'sectorId'>[];
}

/**
 * Guarda un sector entero como quedó en el editor. Lo que ya no está se
 * archiva y no se borra: una mesa sacada del plano sigue nombrada en las
 * cuentas que tuvo.
 */
export async function guardarSector(actor: UsuarioSesion, datos: DatosSector, ip: string | null) {
  exigirPlano(actor);
  const numeros = datos.elementos.filter((e) => e.tipo === 'mesa').map((e) => e.numeroMesa);
  if (numeros.some((n) => n === null)) throw new ErrorDominio('Cada mesa necesita su número');
  if (new Set(numeros).size !== numeros.length) throw new ErrorDominio('Hay dos mesas con el mismo número en este sector');

  await db.transaction(async (tx) => {
    const ids = datos.elementos.map((e) => e.id);
    const repetidaEnOtro = numeros.length
      ? await tx
          .select({ numero: elementosPlano.numeroMesa })
          .from(elementosPlano)
          .where(
            and(
              eq(elementosPlano.tipo, 'mesa'),
              isNull(elementosPlano.archivadoEn),
              ne(elementosPlano.sectorId, datos.id),
              inArray(elementosPlano.numeroMesa, numeros as number[]),
            ),
          )
          .limit(1)
      : [];
    if (repetidaEnOtro[0]) throw new ErrorDominio(`La mesa ${repetidaEnOtro[0].numero} ya existe en otro sector`);

    if (datos.nuevo) {
      await tx.insert(sectores).values({ id: datos.id, nombre: datos.nombre, orden: datos.orden, ancho: datos.ancho, alto: datos.alto });
    } else {
      await tx.update(sectores).set({ nombre: datos.nombre, orden: datos.orden, ancho: datos.ancho, alto: datos.alto }).where(eq(sectores.id, datos.id));
    }

    // Primero se archiva lo que salió: así un número que pasó de una mesa
    // quitada a una nueva no choca con el índice único.
    await tx
      .update(elementosPlano)
      .set({ archivadoEn: new Date() })
      .where(and(eq(elementosPlano.sectorId, datos.id), isNull(elementosPlano.archivadoEn), ids.length ? notInArray(elementosPlano.id, ids) : undefined));

    for (const e of datos.elementos) {
      const fila = { ...e, sectorId: datos.id, numeroMesa: e.tipo === 'mesa' ? e.numeroMesa : null, capacidad: e.tipo === 'mesa' ? e.capacidad : null };
      await tx.insert(elementosPlano).values(fila).onConflictDoUpdate({ target: elementosPlano.id, set: { ...fila, archivadoEn: null } });
    }
  });

  await auditar({
    accion: 'plano.modificado',
    actor,
    objetivoTipo: 'plano',
    objetivoId: datos.id,
    detalle: { sector: datos.nombre, mesas: numeros, elementos: datos.elementos.length },
    ip,
  });
}

export async function archivarSector(actor: UsuarioSesion, id: string, ip: string | null) {
  exigirPlano(actor);
  const ahora = new Date();
  await db.transaction(async (tx) => {
    await tx.update(sectores).set({ archivadoEn: ahora }).where(eq(sectores.id, id));
    await tx.update(elementosPlano).set({ archivadoEn: ahora }).where(and(eq(elementosPlano.sectorId, id), isNull(elementosPlano.archivadoEn)));
  });
  await auditar({ accion: 'plano.modificado', actor, objetivoTipo: 'plano', objetivoId: id, detalle: { archivado: true }, ip });
}
