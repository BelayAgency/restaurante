import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CampoBuscarVivo } from '@/components/campo-buscar-vivo';
import { Paginacion } from '@/components/paginacion';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { normalizar } from '@/lib/texto';
import { leerProductos } from '@/servidor/productos';
import { leerStock } from '@/servidor/stock';
import { PantallaStock } from './pantalla-stock';

export const metadata: Metadata = { title: 'Stock' };

const POR_PAGINA = 15;

/**
 * La tabla se filtra y pagina acá, por la URL. Los modales (movimientos,
 * recetas) reciben igual todos los insumos: para transferir o dar de baja se
 * elige entre todos, no entre los de la página que se está mirando.
 */
export default async function PaginaStock({ searchParams }: PageProps<'/stock'>) {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'stock.contar')) redirect('/');
  const { buscar, pagina } = await searchParams;
  const texto = typeof buscar === 'string' ? buscar.slice(0, 80) : '';
  const [stock, productos] = await Promise.all([leerStock(usuario), puede(usuario, 'stock.administrar') ? leerProductos(usuario) : null]);

  const buscado = normalizar(texto);
  const encontrados = buscado ? stock.insumos.filter((i) => normalizar(i.nombre).includes(buscado)) : stock.insumos;
  const totalPaginas = Math.max(1, Math.ceil(encontrados.length / POR_PAGINA));
  const actual = Math.min(totalPaginas, Math.max(1, Number(pagina) || 1));
  const href = (n: number) => `/stock?${new URLSearchParams({ ...(texto ? { buscar: texto } : {}), pagina: String(n) })}`;

  return (
    <PantallaStock
      stock={stock}
      productos={productos}
      filas={encontrados.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA)}
      buscando={texto}
      buscador={<CampoBuscarVivo ruta="/stock" valor={texto} placeholder="Buscar insumo" />}
      paginacion={<Paginacion pagina={actual} totalPaginas={totalPaginas} totalFilas={encontrados.length} construirHref={href} />}
    />
  );
}
