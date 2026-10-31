import { Insignia, type TonoInsignia } from '@/components/ui';
import type { EstadoComprobante } from '@/servidor/compras';

const ESTADO: Record<EstadoComprobante, { texto: string; tono: TonoInsignia }> = {
  pendiente: { texto: 'Pendiente', tono: 'alerta' },
  parcial: { texto: 'Parcial', tono: 'alerta' },
  pagada: { texto: 'Pagada', tono: 'exito' },
  reclamo: { texto: 'En reclamo', tono: 'error' },
  anulada: { texto: 'Anulada', tono: 'neutro' },
  nota_credito: { texto: 'Nota de crédito', tono: 'neutro' },
};

export function InsigniaEstado({ estado }: { estado: EstadoComprobante }) {
  return <Insignia tono={ESTADO[estado].tono}>{ESTADO[estado].texto}</Insignia>;
}
