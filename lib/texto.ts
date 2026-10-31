/** Sin tildes ni mayúsculas, para buscar: «noquis» encuentra «Ñoquis» y «milanesa», «Milanesa». */
export const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
