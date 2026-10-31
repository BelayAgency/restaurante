import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CampoBuscarVivo } from '@/components/campo-buscar-vivo';
import { FiltroSelector } from '@/components/filtro-selector';
import { Paginacion } from '@/components/paginacion';
import { NavegadorPeriodo } from '@/components/periodo';
import { TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { leerPeriodo } from '@/lib/periodos';
import { usuarioDePagina } from '@/lib/sesion';
import { cuentasDeProveedores, listarFacturas, resumenCompras, type FiltroEstado } from '@/servidor/compras';
import { leerStock } from '@/servidor/stock';
import { PantallaCompras } from './pantalla-compras';

export const metadata: Metadata = { title: 'Compras' };

// Sin loading.tsx a propósito: entre pestañas de stock queda la página anterior hasta que llega
// ésta, en vez de parpadear un esqueleto. Por eso la navegación espera al servidor.
export const instant = false;

const RUTA = '/stock/compras';
const POR_PAGINA = 20;
const ESTADOS: FiltroEstado[] = ['todas', 'impagas', 'pagadas', 'reclamo', 'anuladas'];

export default async function PaginaCompras({ searchParams }: PageProps<'/stock/compras'>) {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'stock.administrar')) redirect('/stock');
  const parametros = await searchParams;
  const leer = (clave: string) => (typeof parametros[clave] === 'string' ? (parametros[clave] as string) : undefined);
  const periodo = leerPeriodo(leer('tipo'), leer('valor'));
  // Lo primero que se mira es cuánto se le debe a cada uno: por eso abre en proveedores.
  const vista = leer('vista') === 'facturas' ? 'facturas' : 'proveedores';
  const estado = ESTADOS.find((e) => e === leer('estado')) ?? 'todas';
  const buscar = (leer('buscar') ?? '').slice(0, 80);

  const [resumen, listado, cuentas, stock] = await Promise.all([
    resumenCompras(usuario, periodo.desde, periodo.hasta),
    vista === 'facturas' ? listarFacturas(usuario, { desde: periodo.desde, hasta: periodo.hasta, estado, buscar, pagina: Number(leer('pagina')) || 1, porPagina: POR_PAGINA }) : null,
    vista === 'proveedores' ? cuentasDeProveedores(usuario, { buscar, pagina: Number(leer('pagina')) || 1, porPagina: POR_PAGINA }) : null,
    leerStock(usuario),
  ]);

  const href = (pagina: number) => {
    const consulta = new URLSearchParams({ tipo: periodo.tipo, valor: periodo.valor, pagina: String(pagina) });
    if (vista === 'facturas') consulta.set('vista', 'facturas');
    if (vista === 'facturas' && estado !== 'todas') consulta.set('estado', estado);
    if (buscar) consulta.set('buscar', buscar);
    return `${RUTA}?${consulta}`;
  };
  const paginado = listado ?? cuentas;

  return (
    <>
      <TituloSeccion accion={<NavegadorPeriodo periodo={periodo} ruta={RUTA} />}>Compras</TituloSeccion>
      <PantallaCompras
        vista={vista}
        resumen={resumen}
        listado={listado}
        cuentas={cuentas}
        stock={stock}
        filtrando={Boolean(buscar) || estado !== 'todas'}
        // Con key: al cambiar de vista la búsqueda se vacía y el texto escrito no puede quedar de la otra.
        buscador={<CampoBuscarVivo key={vista} ruta={RUTA} valor={buscar} placeholder={vista === 'facturas' ? 'Proveedor, número o fecha' : 'Buscar proveedor'} />}
        filtro={
          <FiltroSelector
            parametro="estado"
            valorTodos="todas"
            opciones={[
              { valor: 'todas', etiqueta: 'Todas' },
              { valor: 'impagas', etiqueta: 'Impagas (todos los meses)' },
              { valor: 'pagadas', etiqueta: 'Pagadas' },
              { valor: 'reclamo', etiqueta: 'En reclamo' },
              { valor: 'anuladas', etiqueta: 'Anuladas' },
            ]}
            className="w-full sm:w-60"
          />
        }
        paginacion={paginado ? <Paginacion pagina={paginado.pagina} totalPaginas={paginado.totalPaginas} totalFilas={paginado.totalFilas} construirHref={href} /> : null}
      />
    </>
  );
}
