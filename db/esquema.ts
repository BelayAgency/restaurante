import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const momento = (nombre: string) => timestamp(nombre, { withTimezone: true, mode: 'date' });

// Las cuatro tablas que maneja better-auth. Las claves JS son las del mapeo de
// `servidor/auth.ts`; las columnas, nuestras.

export const usuarios = pgTable('usuarios', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  email: text('email').notNull().unique(),
  emailVerificado: boolean('email_verificado').notNull().default(false),
  foto: text('foto'),
  rol: text('rol').notNull(),
  activo: boolean('activo').notNull().default(true),
  esSoporte: boolean('es_soporte').notNull().default(false),
  creadoEn: momento('creado_en').notNull().defaultNow(),
  actualizadoEn: momento('actualizado_en').notNull().defaultNow(),
});

export const sesiones = pgTable(
  'sesiones',
  {
    id: text('id').primaryKey(),
    venceEn: momento('vence_en').notNull(),
    token: text('token').notNull().unique(),
    creadoEn: momento('creado_en').notNull().defaultNow(),
    actualizadoEn: momento('actualizado_en').notNull().defaultNow(),
    ip: text('ip'),
    agenteUsuario: text('agente_usuario'),
    usuarioId: text('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
  },
  (t) => [index('sesiones_usuario_idx').on(t.usuarioId)],
);

export const cuentasAuth = pgTable(
  'cuentas_auth',
  {
    id: text('id').primaryKey(),
    idCuenta: text('id_cuenta').notNull(),
    idProveedor: text('id_proveedor').notNull(),
    usuarioId: text('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    tokenAcceso: text('token_acceso'),
    tokenRefresco: text('token_refresco'),
    tokenId: text('token_id'),
    tokenAccesoVenceEn: momento('token_acceso_vence_en'),
    tokenRefrescoVenceEn: momento('token_refresco_vence_en'),
    alcance: text('alcance'),
    contrasena: text('contrasena'),
    creadoEn: momento('creado_en').notNull().defaultNow(),
    actualizadoEn: momento('actualizado_en').notNull().defaultNow(),
  },
  (t) => [index('cuentas_auth_usuario_idx').on(t.usuarioId)],
);

export const verificaciones = pgTable('verificaciones', {
  id: text('id').primaryKey(),
  identificador: text('identificador').notNull(),
  valor: text('valor').notNull(),
  venceEn: momento('vence_en').notNull(),
  creadoEn: momento('creado_en').notNull().defaultNow(),
  actualizadoEn: momento('actualizado_en').notNull().defaultNow(),
});

// Intentos de login por dirección, exista o no la cuenta: si el contador sólo
// existiera para cuentas reales, "te quedan 4 intentos" delataría cuáles son.
export const intentosAcceso = pgTable('intentos_acceso', {
  email: text('email').primaryKey(),
  fallidos: integer('fallidos').notNull().default(0),
  bloqueadoHasta: momento('bloqueado_hasta'),
  actualizadoEn: momento('actualizado_en').notNull().defaultNow(),
});

export const propositoCodigo = pgEnum('proposito_codigo', ['recuperacion', 'cambio_contrasena', 'cambio_email']);

export const codigosVerificacion = pgTable(
  'codigos_verificacion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: text('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    proposito: propositoCodigo('proposito').notNull(),
    codigoHash: text('codigo_hash').notNull(),
    destinatario: text('destinatario').notNull(),
    solicitadoPorId: text('solicitado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    intentos: integer('intentos').notNull().default(0),
    verificadoEn: momento('verificado_en'),
    usadoEn: momento('usado_en'),
    anuladoEn: momento('anulado_en'),
    venceEn: momento('vence_en').notNull(),
    creadoEn: momento('creado_en').notNull().defaultNow(),
  },
  (t) => [index('codigos_usuario_idx').on(t.usuarioId, t.proposito)],
);

// Acciones de administración que no son eventos del salón: usuarios, roles,
// credenciales, dispositivos. Append-only igual que el log.
export const auditoria = pgTable(
  'auditoria',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    accion: text('accion').notNull(),
    actorId: text('actor_id').references(() => usuarios.id, { onDelete: 'set null' }),
    actorEsSoporte: boolean('actor_es_soporte').notNull().default(false),
    objetivoTipo: text('objetivo_tipo').notNull(),
    objetivoId: text('objetivo_id').notNull(),
    detalle: jsonb('detalle').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
    ocurridoEn: momento('ocurrido_en').notNull().defaultNow(),
  },
  (t) => [index('auditoria_objetivo_idx').on(t.objetivoTipo, t.objetivoId), index('auditoria_fecha_idx').on(t.ocurridoEn)],
);

export const dispositivos = pgTable('dispositivos', {
  id: uuid('id').primaryKey(),
  nombre: text('nombre').notNull(),
  registradoPorId: text('registrado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  registradoEn: momento('registrado_en').notNull().defaultNow(),
  ultimoContacto: momento('ultimo_contacto'),
  desfaseRelojMs: integer('desfase_reloj_ms'),
  revocadoEn: momento('revocado_en'),
});

export const pinesOperador = pgTable('pines_operador', {
  usuarioId: text('usuario_id')
    .primaryKey()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  hash: text('hash').notNull(),
  actualizadoEn: momento('actualizado_en').notNull().defaultNow(),
});

export const resultadoEvento = pgEnum('resultado_evento', ['aceptado', 'rechazado']);

// El log. Inmutable en la base y no sólo en el código: la migración le agrega
// un trigger que rechaza UPDATE y DELETE. Una corrección es otro evento.
export const eventos = pgTable(
  'eventos',
  {
    id: uuid('id').primaryKey(),
    secuencia: bigint('secuencia', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    tipo: text('tipo').notNull(),
    version: integer('version').notNull(),
    agregadoTipo: text('agregado_tipo').notNull(),
    agregadoId: text('agregado_id').notNull(),
    datos: jsonb('datos').$type<Record<string, unknown>>().notNull(),
    operadorId: text('operador_id').notNull(),
    autorizadoPorId: text('autorizado_por_id'),
    motivoId: text('motivo_id'),
    motivoTexto: text('motivo_texto'),
    dispositivoId: uuid('dispositivo_id')
      .notNull()
      .references(() => dispositivos.id),
    sesionUsuarioId: text('sesion_usuario_id').notNull(),
    creadoEnDispositivo: momento('creado_en_dispositivo').notNull(),
    recibidoEn: momento('recibido_en').notNull().defaultNow(),
    resultado: resultadoEvento('resultado').notNull(),
    motivoRechazo: text('motivo_rechazo'),
  },
  (t) => [
    uniqueIndex('eventos_secuencia_idx').on(t.secuencia),
    index('eventos_agregado_idx').on(t.agregadoTipo, t.agregadoId),
    index('eventos_rechazados_idx').on(t.recibidoEn).where(sql`${t.resultado} = 'rechazado'`),
  ],
);
