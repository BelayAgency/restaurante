/** Una fila sin su marca de archivado: lo que viaja ya es sólo lo vigente. */
export function sinArchivado<T extends { archivadoEn: Date | null }>(fila: T): Omit<T, 'archivadoEn'> {
  const resto: Partial<T> = { ...fila };
  delete resto.archivadoEn;
  return resto as Omit<T, 'archivadoEn'>;
}
