import { importeItem, totalCuenta, type Cuenta } from '@/dominio/reductores/salon';
import { fechaHora, pesosDesdeCentavos } from '@/lib/formato';

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * La precuenta impresa: una ventana aparte con sólo el ticket, para que la
 * impresora (o el "guardar como PDF" del celular) no se lleve la interfaz.
 * Funciona sin red: se arma con lo que ya está en el dispositivo.
 */
export function imprimirPrecuenta(cuenta: Cuenta, encabezado: { local: string; mesa: string; mozo: string }) {
  const filas = [...cuenta.items.values()]
    .map((item) => {
      const mods = item.modificadores.map((m) => `<div class="mod">${escapar(m.nombre)}</div>`).join('');
      return `<tr><td>${item.cantidad} × ${escapar(item.nombre)}${mods}</td><td class="num">${pesosDesdeCentavos(importeItem(item))}</td></tr>`;
    })
    .join('');

  const ventana = window.open('', 'precuenta', 'width=380,height=640');
  if (!ventana) return false;
  ventana.document.write(`<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Precuenta</title>
<style>
  body { font: 13px/1.4 ui-monospace, monospace; margin: 16px; color: #000; }
  h1 { font-size: 15px; margin: 0 0 4px; text-align: center; }
  .dato { text-align: center; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  td { padding: 3px 0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; padding-left: 8px; }
  .mod { padding-left: 12px; font-size: 12px; }
  .total td { border-top: 1px dashed #000; padding-top: 6px; font-weight: bold; }
  .pie { text-align: center; margin-top: 12px; }
</style></head><body>
<h1>${escapar(encabezado.local)}</h1>
<p class="dato">${escapar(encabezado.mesa)}${cuenta.comensales ? ` · ${cuenta.comensales} ${cuenta.comensales === 1 ? 'comensal' : 'comensales'}` : ''}</p>
<p class="dato">Atendió: ${escapar(encabezado.mozo)}</p>
<p class="dato">${fechaHora(new Date())}</p>
<table>${filas}<tr class="total"><td>Total</td><td class="num">${pesosDesdeCentavos(totalCuenta(cuenta))}</td></tr></table>
<p class="pie">Precuenta — no válida como factura</p>
<script>window.onload = () => { window.print(); };</script>
</body></html>`);
  ventana.document.close();
  return true;
}
