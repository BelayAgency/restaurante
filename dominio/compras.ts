import { z } from 'zod';

/**
 * Las reglas de lo que se carga en Compras: las usan el formulario (para
 * avisar antes de mandar) y el servidor (que vuelve a validar todo).
 */

const centavos = z.number().int().min(0).max(1_000_000_000_000);
const importe = z.number().int().positive('Poné el importe').max(1_000_000_000_000);
const observacion = z.string().trim().max(300, 'La observación es muy larga').nullable();

export const datosComprobante = z
  .object({
    proveedorId: z.uuid('Elegí el proveedor'),
    tipo: z.enum(['factura', 'nota_credito']),
    numeroFactura: z.string().trim().min(1, 'Poné el número').max(40),
    fecha: z.iso.date('La fecha no es válida'),
    totalCentavos: importe,
    observacion,
    depositoId: z.uuid().nullable(),
    lineas: z
      .array(
        z.object({
          insumoId: z.uuid('Elegí el insumo de cada línea'),
          presentacionId: z.uuid().nullable(),
          cantidadPresentaciones: z.number().positive('Cada línea necesita una cantidad').max(1_000_000_000),
          costoCentavos: centavos,
        }),
      )
      .max(100),
  })
  .refine((d) => !d.lineas.length || d.depositoId, { message: 'Elegí a qué depósito entra la mercadería', path: ['depositoId'] })
  .refine((d) => d.tipo === 'factura' || !d.lineas.length, { message: 'Una nota de crédito no lleva insumos', path: ['lineas'] });

export const datosCorreccion = z.object({
  proveedorId: z.uuid('Elegí el proveedor'),
  numeroFactura: z.string().trim().min(1, 'Poné el número').max(40),
  fecha: z.iso.date('La fecha no es válida'),
  totalCentavos: importe,
  observacion,
});

export const datosPago = z.object({
  proveedorId: z.uuid('Elegí el proveedor'),
  fecha: z.iso.date('La fecha no es válida'),
  importeCentavos: importe,
  forma: z.enum(['efectivo', 'transferencia', 'mercado_pago', 'cheque', 'tarjeta'], 'Elegí la forma de pago'),
  observacion,
});

export const motivoAnulacion = z.string().trim().min(3, 'Escribí el motivo').max(200);

export const NOMBRE_FORMA_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercado_pago: 'Mercado Pago', cheque: 'Cheque', tarjeta: 'Tarjeta' } as const;
