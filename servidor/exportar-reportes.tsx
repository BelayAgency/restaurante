import 'server-only';
import ExcelJS from 'exceljs';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { formatearCantidad, type UnidadBase } from '@/dominio/stock';
import { fechaCorta, pesosDesdeCentavos } from '@/lib/formato';
import { NOMBRE_SISTEMA } from '@/lib/marca';
import type { ReporteVentas } from './reportes';

export interface DatosExportacion {
  periodo: string;
  ventas: ReporteVentas;
  compras: { proveedor: string; totalCentavos: number; facturas: number }[];
  stock: { nombre: string; unidad: UnidadBase; cantidad: number; valorCentavos: number }[];
}

const FORMATO_PESOS = '"$" #,##0.00';

// En la planilla la plata va como número para que se pueda sumar: es el único
// lugar donde se pasa de centavos a pesos con una división, y sólo para eso.
const pesos = (centavos: number) => centavos / 100;

function hoja(libro: ExcelJS.Workbook, nombre: string, columnas: { titulo: string; ancho: number; plata?: boolean }[], filas: (string | number)[][]) {
  const h = libro.addWorksheet(nombre);
  h.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho, style: c.plata ? { numFmt: FORMATO_PESOS } : {} }));
  h.getRow(1).font = { bold: true };
  for (const fila of filas) h.addRow(fila);
  h.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function excelDeReportes(d: DatosExportacion): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = NOMBRE_SISTEMA;
  const r = d.ventas.resumen;
  hoja(libro, 'Resumen', [{ titulo: d.periodo, ancho: 28 }, { titulo: '', ancho: 18 }], [
    ['Ventas', pesos(r.ventasCentavos)],
    ['Propinas', pesos(r.propinasCentavos)],
    ['Cuentas', r.cuentas],
    ['Comensales', r.comensales],
    ['Ticket promedio', pesos(r.ticketPromedioCentavos)],
    ['Por comensal', pesos(r.porComensalCentavos)],
  ]);
  libro.getWorksheet('Resumen')!.getColumn(2).numFmt = FORMATO_PESOS;
  hoja(libro, 'Por día', [{ titulo: 'Día', ancho: 14 }, { titulo: 'Ventas', ancho: 16, plata: true }], d.ventas.porDia.map((x) => [fechaCorta(x.dia), pesos(x.ventasCentavos)]));
  hoja(libro, 'Por hora', [{ titulo: 'Hora', ancho: 10 }, { titulo: 'Ventas', ancho: 16, plata: true }], d.ventas.porHora.map((c, h) => [`${String(h).padStart(2, '0')}:00`, pesos(c)]));
  hoja(libro, 'Día de la semana', [{ titulo: 'Día', ancho: 14 }, { titulo: 'Ventas', ancho: 16, plata: true }], d.ventas.porSemana.map((x) => [x.dia, pesos(x.ventasCentavos)]));
  hoja(
    libro,
    'Platos',
    [{ titulo: 'Plato', ancho: 32 }, { titulo: 'Categoría', ancho: 20 }, { titulo: 'Unidades', ancho: 10 }, { titulo: 'Ventas', ancho: 16, plata: true }, { titulo: 'Costo teórico', ancho: 16, plata: true }, { titulo: 'Margen', ancho: 16, plata: true }],
    d.ventas.platos.map((x) => [x.nombre, x.categoria, x.cantidad, pesos(x.ventasCentavos), x.costoCentavos === null ? '' : pesos(x.costoCentavos), x.margenCentavos === null ? '' : pesos(x.margenCentavos)]),
  );
  hoja(libro, 'Categorías', [{ titulo: 'Categoría', ancho: 24 }, { titulo: 'Unidades', ancho: 10 }, { titulo: 'Ventas', ancho: 16, plata: true }], d.ventas.porCategoria.map((x) => [x.nombre, x.cantidad, pesos(x.ventasCentavos)]));
  hoja(
    libro,
    'Mozos',
    [{ titulo: 'Mozo', ancho: 24 }, { titulo: 'Cuentas', ancho: 10 }, { titulo: 'Comensales', ancho: 12 }, { titulo: 'Ventas', ancho: 16, plata: true }, { titulo: 'Por comensal', ancho: 16, plata: true }],
    d.ventas.porMozo.map((m) => [m.nombre, m.cuentas, m.comensales, pesos(m.ventasCentavos), pesos(m.porComensalCentavos)]),
  );
  hoja(libro, 'Compras', [{ titulo: 'Proveedor', ancho: 28 }, { titulo: 'Facturas', ancho: 10 }, { titulo: 'Total', ancho: 16, plata: true }], d.compras.map((c) => [c.proveedor, c.facturas, pesos(c.totalCentavos)]));
  hoja(libro, 'Stock', [{ titulo: 'Insumo', ancho: 28 }, { titulo: 'Cantidad', ancho: 16 }, { titulo: 'Valor', ancho: 16, plata: true }], d.stock.map((x) => [x.nombre, formatearCantidad(x.cantidad, x.unidad), pesos(x.valorCentavos)]));
  return Buffer.from(await libro.xlsx.writeBuffer());
}

// Un PDF para imprimir o mandar: blanco y negro, sin la paleta de la app.
const estilos = StyleSheet.create({
  pagina: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#000' },
  titulo: { fontSize: 16, marginBottom: 2 },
  bajada: { fontSize: 10, marginBottom: 16, color: '#444' },
  seccion: { fontSize: 11, marginTop: 14, marginBottom: 6 },
  fila: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingVertical: 3 },
  cabeza: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 3, fontFamily: 'Helvetica-Bold' },
  celda: { flex: 2 },
  numero: { flex: 1, textAlign: 'right' },
  resumen: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  cifra: { flex: 1, borderWidth: 0.5, borderColor: '#ccc', padding: 8 },
});

function TablaPdf({ cabeza, filas }: { cabeza: string[]; filas: string[][] }) {
  return (
    <View>
      <View style={estilos.cabeza}>
        {cabeza.map((c, i) => (
          <Text key={c} style={i === 0 ? estilos.celda : estilos.numero}>
            {c}
          </Text>
        ))}
      </View>
      {filas.map((fila, i) => (
        <View key={i} style={estilos.fila} wrap={false}>
          {fila.map((celda, j) => (
            <Text key={j} style={j === 0 ? estilos.celda : estilos.numero}>
              {celda}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export async function pdfDeReportes(d: DatosExportacion): Promise<Buffer> {
  const r = d.ventas.resumen;
  const p = pesosDesdeCentavos;
  return renderToBuffer(
    <Document title={`Reportes · ${d.periodo}`} author={NOMBRE_SISTEMA}>
      <Page size="A4" style={estilos.pagina}>
        <Text style={estilos.titulo}>{NOMBRE_SISTEMA} · Reportes</Text>
        <Text style={estilos.bajada}>{d.periodo}</Text>
        <View style={estilos.resumen}>
          {[
            ['Ventas', p(r.ventasCentavos)],
            ['Cuentas', String(r.cuentas)],
            ['Ticket promedio', p(r.ticketPromedioCentavos)],
            ['Por comensal', p(r.porComensalCentavos)],
          ].map(([etiqueta, valor]) => (
            <View key={etiqueta} style={estilos.cifra}>
              <Text>{etiqueta}</Text>
              <Text style={{ fontSize: 12, marginTop: 2 }}>{valor}</Text>
            </View>
          ))}
        </View>
        <Text style={estilos.seccion}>Platos</Text>
        <TablaPdf cabeza={['Plato', 'Unidades', 'Ventas', 'Margen']} filas={d.ventas.platos.map((x) => [x.nombre, String(x.cantidad), p(x.ventasCentavos), x.margenCentavos === null ? '—' : p(x.margenCentavos)])} />
        <Text style={estilos.seccion}>Mozos</Text>
        <TablaPdf cabeza={['Mozo', 'Cuentas', 'Ventas', 'Por comensal']} filas={d.ventas.porMozo.map((m) => [m.nombre, String(m.cuentas), p(m.ventasCentavos), p(m.porComensalCentavos)])} />
        <Text style={estilos.seccion}>Por día</Text>
        <TablaPdf cabeza={['Día', 'Ventas']} filas={d.ventas.porDia.map((x) => [fechaCorta(x.dia), p(x.ventasCentavos)])} />
        <Text style={estilos.seccion}>Compras por proveedor</Text>
        <TablaPdf cabeza={['Proveedor', 'Facturas', 'Total']} filas={d.compras.map((c) => [c.proveedor, String(c.facturas), p(c.totalCentavos)])} />
        <Text style={estilos.seccion}>Valorización del stock</Text>
        <TablaPdf cabeza={['Insumo', 'Cantidad', 'Valor']} filas={d.stock.map((x) => [x.nombre, formatearCantidad(x.cantidad, x.unidad), p(x.valorCentavos)])} />
      </Page>
    </Document>,
  );
}
