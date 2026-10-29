import { connection } from 'next/server';
import { leerPeriodo } from '@/lib/periodos';
import { exigirSesion, respuestaDeError } from '@/lib/sesion';
import { excelDeReportes, pdfDeReportes } from '@/servidor/exportar-reportes';
import { reporteDeCompras, reporteDeVentas, valorizacionDeStock } from '@/servidor/reportes';

export async function GET(pedido: Request) {
  await connection();
  try {
    const actor = await exigirSesion('reportes.ver');
    const parametros = new URL(pedido.url).searchParams;
    const periodo = leerPeriodo(parametros.get('tipo') ?? undefined, parametros.get('valor') ?? undefined);
    const formato = parametros.get('formato') === 'pdf' ? 'pdf' : 'xlsx';
    const [ventas, compras, stock] = await Promise.all([
      reporteDeVentas(actor, periodo.desde, periodo.hasta),
      reporteDeCompras(actor, periodo.desde, periodo.hasta),
      valorizacionDeStock(actor),
    ]);
    const datos = { periodo: periodo.etiqueta, ventas, compras, stock };
    const archivo = formato === 'pdf' ? await pdfDeReportes(datos) : await excelDeReportes(datos);
    const nombre = `reportes-${periodo.valor}.${formato}`;
    return new Response(new Uint8Array(archivo), {
      headers: {
        'content-type': formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${nombre}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return respuestaDeError(error);
  }
}
