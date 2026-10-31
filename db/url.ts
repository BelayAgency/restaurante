/**
 * La URL de la base según quién la provea. En el servidor propio es
 * DATABASE_URL; en Vercel la carga la integración de Neon, que según cómo se
 * conectó usa DATABASE_URL, POSTGRES_URL o un prefijo propio
 * (STORAGE_DATABASE_URL). Sin ninguna, el driver de Postgres probaría
 * 127.0.0.1:5432 y el error diría «conexión rechazada» en vez de lo que pasa.
 *
 * `directa` pide la conexión sin pooler: LISTEN, migraciones y la carga de la
 * demo no funcionan a través del pooler de Neon.
 */
export function urlBase({ directa = false }: { directa?: boolean } = {}): string {
  const env = process.env;
  const conPrefijo = (sufijo: string) => Object.keys(env).find((clave) => clave.endsWith(sufijo) && env[clave]);
  const candidatas = [
    ...(directa ? [env.DATABASE_URL_UNPOOLED, env.POSTGRES_URL_NON_POOLING, env[conPrefijo('_DATABASE_URL_UNPOOLED') ?? '']] : []),
    env.DATABASE_URL,
    env.POSTGRES_URL,
    env[conPrefijo('_DATABASE_URL') ?? ''],
  ];
  const url = candidatas.find((c) => c);
  if (!url) throw new Error('Falta la URL de la base: conectá Neon al proyecto (o cargá DATABASE_URL) en el entorno de este deploy');
  return url;
}
