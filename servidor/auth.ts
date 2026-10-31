import 'server-only';
import { hash, verify } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/db/cliente';
import { cuentasAuth, sesiones, usuarios, verificaciones } from '@/db/esquema';

// "Mantener la sesión iniciada" va al tope que acepta el navegador. Más de 400
// días Chrome lo recorta igual, y la cookie y el vencimiento en la base tienen
// que coincidir: si sólo se alarga uno, la sesión muere por el otro.
export const DURACION_SESION_S = 400 * 24 * 60 * 60;

const esquema = {
  usuarios,
  sesiones,
  cuentas_auth: cuentasAuth,
  verificaciones,
};

export const auth = betterAuth({
  // En Vercel, sin configurar nada, la URL de producción del proyecto.
  baseURL: process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined),
  secret: process.env.BETTER_AUTH_SECRET,
  // Los previews de Vercel tienen su propia URL por deploy y por rama: sin esto, el login
  // rebota en todos menos en el de producción.
  trustedOrigins: [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean).map((u) => `https://${u}`),
  database: drizzleAdapter(db, { provider: 'pg', schema: esquema }),
  emailAndPassword: {
    enabled: true,
    // Las cuentas las crea quien administra el sistema (servidor/usuarios.ts),
    // nunca la persona desde afuera.
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    password: {
      hash: (contrasena) => hash(contrasena),
      verify: ({ hash: guardado, password }) => verify(guardado, password),
    },
  },
  session: {
    modelName: 'sesiones',
    expiresIn: DURACION_SESION_S,
    // Deslizante: con un día, quien entra seguido no vuelve a ver el login.
    updateAge: 24 * 60 * 60,
    // Demo: Vercel atiende con varias instancias y cada una tiene su base en memoria; la
    // sesión creada en una no existe en las otras. Firmada en la cookie, la valida cualquiera.
    cookieCache: { enabled: true, maxAge: 7 * 24 * 60 * 60 },
    fields: {
      expiresAt: 'venceEn',
      ipAddress: 'ip',
      userAgent: 'agenteUsuario',
      userId: 'usuarioId',
      createdAt: 'creadoEn',
      updatedAt: 'actualizadoEn',
    },
  },
  user: {
    modelName: 'usuarios',
    fields: {
      name: 'nombre',
      emailVerified: 'emailVerificado',
      image: 'foto',
      createdAt: 'creadoEn',
      updatedAt: 'actualizadoEn',
    },
    additionalFields: {
      rol: { type: 'string', required: true, input: false },
      activo: { type: 'boolean', required: true, defaultValue: true, input: false },
      esSoporte: { type: 'boolean', required: true, defaultValue: false, input: false },
    },
  },
  account: {
    modelName: 'cuentas_auth',
    fields: {
      accountId: 'idCuenta',
      providerId: 'idProveedor',
      userId: 'usuarioId',
      accessToken: 'tokenAcceso',
      refreshToken: 'tokenRefresco',
      idToken: 'tokenId',
      accessTokenExpiresAt: 'tokenAccesoVenceEn',
      refreshTokenExpiresAt: 'tokenRefrescoVenceEn',
      scope: 'alcance',
      password: 'contrasena',
      createdAt: 'creadoEn',
      updatedAt: 'actualizadoEn',
    },
  },
  verification: {
    modelName: 'verificaciones',
    fields: {
      identifier: 'identificador',
      value: 'valor',
      expiresAt: 'venceEn',
      createdAt: 'creadoEn',
      updatedAt: 'actualizadoEn',
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Última barrera: aunque algo llegue a crear la sesión, una cuenta
        // desactivada no entra.
        before: async (sesion) => {
          const usuario = await db.query.usuarios.findFirst({ where: (u, { eq }) => eq(u.id, sesion.userId) });
          if (!usuario?.activo) return false;
          return { data: sesion };
        },
      },
    },
  },
  // El límite de intentos y el bloqueo los maneja `servidor/acceso.ts`, que es
  // el único camino de entrada (el handler HTTP de better-auth no expone el
  // login). Éste queda para lo que sí está expuesto.
  rateLimit: { enabled: true, window: 60, max: 60 },
  advanced: {
    useSecureCookies: process.env.BETTER_AUTH_URL?.startsWith('https://') ?? false,
    database: { generateId: () => crypto.randomUUID() },
  },
  plugins: [nextCookies()],
});

export type SesionAuth = typeof auth.$Infer.Session;
