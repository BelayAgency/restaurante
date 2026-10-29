import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
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
    diaOperativoId: uuid('dia_operativo_id'),
    // Llegó con hora de un día que ya estaba cerrado: se acepta (lo cobrado se
    // cobró) pero entra en el día siguiente, marcado.
    posteriorAlCierre: boolean('posterior_al_cierre').notNull().default(false),
  },
  (t) => [
    uniqueIndex('eventos_secuencia_idx').on(t.secuencia),
    index('eventos_agregado_idx').on(t.agregadoTipo, t.agregadoId),
    index('eventos_rechazados_idx').on(t.recibidoEn).where(sql`${t.resultado} = 'rechazado'`),
  ],
);

// Salón y carta. Es configuración: se edita con conexión y baja a los
// dispositivos con el catálogo. Nada se borra: lo que deja de usarse se
// archiva, porque los eventos viejos lo siguen nombrando.

export const sectores = pgTable('sectores', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  orden: integer('orden').notNull().default(0),
  ancho: integer('ancho').notNull().default(1200),
  alto: integer('alto').notNull().default(800),
  archivadoEn: momento('archivado_en'),
});

export const tipoElementoPlano = pgEnum('tipo_elemento_plano', ['mesa', 'pared', 'barra', 'columna', 'puerta', 'cocina']);
export const formaElemento = pgEnum('forma_elemento', ['redonda', 'rectangular']);

export const elementosPlano = pgTable(
  'elementos_plano',
  {
    id: uuid('id').primaryKey(),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => sectores.id),
    tipo: tipoElementoPlano('tipo').notNull(),
    forma: formaElemento('forma').notNull().default('rectangular'),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    ancho: integer('ancho').notNull(),
    alto: integer('alto').notNull(),
    rotacion: integer('rotacion').notNull().default(0),
    numeroMesa: integer('numero_mesa'),
    capacidad: integer('capacidad'),
    archivadoEn: momento('archivado_en'),
  },
  (t) => [
    index('elementos_sector_idx').on(t.sectorId),
    // Dos mesas activas con el mismo número serían dos lugares para la misma comanda.
    uniqueIndex('mesas_numero_activo_idx').on(t.numeroMesa).where(sql`${t.tipo} = 'mesa' and ${t.archivadoEn} is null`),
  ],
);

export const estaciones = pgTable('estaciones', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  orden: integer('orden').notNull().default(0),
  archivadoEn: momento('archivado_en'),
});

export const categorias = pgTable('categorias', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  orden: integer('orden').notNull().default(0),
  archivadoEn: momento('archivado_en'),
});

export const productos = pgTable(
  'productos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id),
    estacionId: uuid('estacion_id')
      .notNull()
      .references(() => estaciones.id),
    disponible: boolean('disponible').notNull().default(true),
    orden: integer('orden').notNull().default(0),
    creadoEn: momento('creado_en').notNull().defaultNow(),
    archivadoEn: momento('archivado_en'),
  },
  (t) => [index('productos_categoria_idx').on(t.categoriaId)],
);

// Un precio no se edita: se archiva y se crea otro. Lo que se cobró en cada
// momento queda en la fila que estaba vigente.
export const preciosProducto = pgTable(
  'precios_producto',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id),
    precioCentavos: bigint('precio_centavos', { mode: 'number' }).notNull(),
    vigenteDesde: momento('vigente_desde').notNull().defaultNow(),
    archivadoEn: momento('archivado_en'),
    creadoPorId: text('creado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('precio_vigente_idx').on(t.productoId).where(sql`${t.archivadoEn} is null`)],
);

export const gruposModificador = pgTable('grupos_modificador', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  obligatorio: boolean('obligatorio').notNull().default(false),
  multiple: boolean('multiple').notNull().default(false),
  archivadoEn: momento('archivado_en'),
});

// El precio de un modificador sigue la misma regla que el de un producto:
// cambiarlo es archivar la opción y crear otra.
export const modificadores = pgTable(
  'modificadores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => gruposModificador.id),
    nombre: text('nombre').notNull(),
    precioCentavos: bigint('precio_centavos', { mode: 'number' }).notNull().default(0),
    orden: integer('orden').notNull().default(0),
    archivadoEn: momento('archivado_en'),
  },
  (t) => [index('modificadores_grupo_idx').on(t.grupoId)],
);

export const productosGrupos = pgTable(
  'productos_grupos',
  {
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => gruposModificador.id),
    orden: integer('orden').notNull().default(0),
  },
  (t) => [uniqueIndex('productos_grupos_idx').on(t.productoId, t.grupoId)],
);

export const mediosPago = pgTable('medios_pago', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  efectivo: boolean('efectivo').notNull().default(false),
  orden: integer('orden').notNull().default(0),
  archivadoEn: momento('archivado_en'),
});

// El día operativo va de un cierre al siguiente, no de medianoche a
// medianoche: un turno de noche termina a las 2 y sigue siendo el mismo día.
export const diasOperativos = pgTable('dias_operativos', {
  id: uuid('id').primaryKey().defaultRandom(),
  abiertoEn: momento('abierto_en').notNull().defaultNow(),
  cerradoEn: momento('cerrado_en'),
  cerradoPorId: text('cerrado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  totales: jsonb('totales').$type<Record<string, unknown>>(),
});

// Stock. Se opera con conexión (decisión 0.6 de la planificación): un conteo
// o una compra se cargan cuando vuelve internet. Las cantidades van en la
// unidad base del insumo (g, ml o unidades) y los costos en centavos por
// unidad base, con decimales: un mililitro de aceite cuesta fracciones de
// centavo.

const cantidad = (nombre: string) => numeric(nombre, { precision: 18, scale: 4, mode: 'number' });
const costoUnitario = (nombre: string) => numeric(nombre, { precision: 18, scale: 6, mode: 'number' });

export const unidadBase = pgEnum('unidad_base', ['g', 'ml', 'u']);
export const tipoInsumo = pgEnum('tipo_insumo', ['compra', 'preparacion']);

export const depositos = pgTable('depositos', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  // De dónde sale lo que se vende: el consumo teórico se descuenta de acá.
  deVenta: boolean('de_venta').notNull().default(false),
  archivadoEn: momento('archivado_en'),
});

export const insumos = pgTable('insumos', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  tipo: tipoInsumo('tipo').notNull().default('compra'),
  unidad: unidadBase('unidad').notNull(),
  stockMinimo: cantidad('stock_minimo').notNull().default(0),
  costoUnitario: costoUnitario('costo_unitario').notNull().default(0),
  archivadoEn: momento('archivado_en'),
});

// Cómo se compra: «Bidón 5 L» son 5000 ml del insumo aceite.
export const presentaciones = pgTable('presentaciones', {
  id: uuid('id').primaryKey().defaultRandom(),
  insumoId: uuid('insumo_id')
    .notNull()
    .references(() => insumos.id),
  nombre: text('nombre').notNull(),
  cantidadBase: cantidad('cantidad_base').notNull(),
  archivadoEn: momento('archivado_en'),
});

export const historialCostos = pgTable(
  'historial_costos',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    insumoId: uuid('insumo_id')
      .notNull()
      .references(() => insumos.id),
    costoUnitario: costoUnitario('costo_unitario').notNull(),
    motivo: text('motivo').notNull(),
    referenciaId: text('referencia_id'),
    desde: momento('desde').notNull().defaultNow(),
  },
  (t) => [index('historial_costos_insumo_idx').on(t.insumoId, t.desde)],
);

// Una receta es de un producto de la carta o de una preparación (un insumo
// que se elabora). No se edita: se archiva y se crea otra, así el consumo
// teórico de una venta vieja se calcula con la receta de ese momento.
export const recetas = pgTable(
  'recetas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productoId: uuid('producto_id').references(() => productos.id),
    preparacionId: uuid('preparacion_id').references(() => insumos.id),
    /** Cuánto rinde, en la unidad de la preparación. Para un producto, 1 porción. */
    rendimiento: cantidad('rendimiento').notNull().default(1),
    vigenteDesde: momento('vigente_desde').notNull().defaultNow(),
    archivadoEn: momento('archivado_en'),
    creadoPorId: text('creado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('receta_producto_vigente_idx').on(t.productoId).where(sql`${t.archivadoEn} is null and ${t.productoId} is not null`),
    uniqueIndex('receta_preparacion_vigente_idx').on(t.preparacionId).where(sql`${t.archivadoEn} is null and ${t.preparacionId} is not null`),
  ],
);

export const lineasReceta = pgTable(
  'lineas_receta',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recetaId: uuid('receta_id')
      .notNull()
      .references(() => recetas.id),
    insumoId: uuid('insumo_id')
      .notNull()
      .references(() => insumos.id),
    cantidad: cantidad('cantidad').notNull(),
    /** Lo que se pierde al limpiar o cocinar, en porcentaje: hace falta más bruto que neto. */
    mermaPorcentaje: numeric('merma_porcentaje', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
  },
  (t) => [index('lineas_receta_idx').on(t.recetaId)],
);

export const proveedores = pgTable('proveedores', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  cuit: text('cuit'),
  archivadoEn: momento('archivado_en'),
});

export const compras = pgTable('compras', {
  id: uuid('id').primaryKey().defaultRandom(),
  proveedorId: uuid('proveedor_id')
    .notNull()
    .references(() => proveedores.id),
  depositoId: uuid('deposito_id')
    .notNull()
    .references(() => depositos.id),
  numeroFactura: text('numero_factura').notNull(),
  fecha: text('fecha').notNull(),
  totalCentavos: bigint('total_centavos', { mode: 'number' }).notNull(),
  registradaPorId: text('registrada_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  registradaEn: momento('registrada_en').notNull().defaultNow(),
});

export const lineasCompra = pgTable('lineas_compra', {
  id: uuid('id').primaryKey().defaultRandom(),
  compraId: uuid('compra_id')
    .notNull()
    .references(() => compras.id),
  insumoId: uuid('insumo_id')
    .notNull()
    .references(() => insumos.id),
  presentacionId: uuid('presentacion_id').references(() => presentaciones.id),
  cantidadPresentaciones: cantidad('cantidad_presentaciones').notNull(),
  cantidadBase: cantidad('cantidad_base').notNull(),
  costoCentavos: bigint('costo_centavos', { mode: 'number' }).notNull(),
});

export const tipoMovimiento = pgEnum('tipo_movimiento', [
  'venta_teorica',
  'compra',
  'produccion_salida',
  'produccion_entrada',
  'transferencia_salida',
  'transferencia_entrada',
  'merma',
  'vencimiento',
  'comida_personal',
  'ajuste_conteo',
]);

// El stock es la suma de esto. Append-only como el log: una corrección es
// otro movimiento.
export const movimientosStock = pgTable(
  'movimientos_stock',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    insumoId: uuid('insumo_id')
      .notNull()
      .references(() => insumos.id),
    depositoId: uuid('deposito_id')
      .notNull()
      .references(() => depositos.id),
    tipo: tipoMovimiento('tipo').notNull(),
    cantidad: cantidad('cantidad').notNull(),
    costoUnitario: costoUnitario('costo_unitario').notNull(),
    motivo: text('motivo'),
    referenciaTipo: text('referencia_tipo'),
    referenciaId: text('referencia_id'),
    actorId: text('actor_id'),
    ocurridoEn: momento('ocurrido_en').notNull(),
    registradoEn: momento('registrado_en').notNull().defaultNow(),
  },
  (t) => [
    index('movimientos_insumo_idx').on(t.insumoId, t.depositoId),
    index('movimientos_fecha_idx').on(t.ocurridoEn),
    // El consumo teórico de un ítem se genera una sola vez aunque el evento se reciba de nuevo.
    uniqueIndex('movimientos_referencia_idx').on(t.referenciaTipo, t.referenciaId, t.insumoId, t.tipo),
  ],
);

export const conteos = pgTable('conteos', {
  id: uuid('id').primaryKey().defaultRandom(),
  depositoId: uuid('deposito_id')
    .notNull()
    .references(() => depositos.id),
  alcance: text('alcance').notNull(),
  abiertoPorId: text('abierto_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  abiertoEn: momento('abierto_en').notNull().defaultNow(),
  cerradoPorId: text('cerrado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  cerradoEn: momento('cerrado_en'),
});

export const lineasConteo = pgTable(
  'lineas_conteo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conteoId: uuid('conteo_id')
      .notNull()
      .references(() => conteos.id),
    insumoId: uuid('insumo_id')
      .notNull()
      .references(() => insumos.id),
    contado: cantidad('contado'),
    // Se fija al cerrar, no al abrir: mientras se cuenta nadie lo ve.
    teorico: cantidad('teorico'),
  },
  (t) => [uniqueIndex('lineas_conteo_idx').on(t.conteoId, t.insumoId)],
);

// Control interno: los motivos que se eligen al autorizar, quién autoriza
// cada acción y los umbrales de las alertas. Se configura con conexión y baja
// a los dispositivos con el catálogo.

export const motivosAutorizacion = pgTable('motivos_autorizacion', {
  id: uuid('id').primaryKey().defaultRandom(),
  accion: text('accion').notNull(),
  texto: text('texto').notNull(),
  orden: integer('orden').notNull().default(0),
  archivadoEn: momento('archivado_en'),
});

export const reglasAutorizacion = pgTable('reglas_autorizacion', {
  accion: text('accion').primaryKey(),
  roles: text('roles').array().notNull(),
});

export const configuracionControl = pgTable('configuracion_control', {
  id: integer('id').primaryKey().default(1),
  umbrales: jsonb('umbrales').$type<Record<string, number>>().notNull().default({}),
  actualizadoEn: momento('actualizado_en').notNull().defaultNow(),
});

// Una alerta se calcula del log; lo único que se guarda es que alguien la vio.
export const alertasVistas = pgTable('alertas_vistas', {
  clave: text('clave').primaryKey(),
  vistaPorId: text('vista_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  vistaEn: momento('vista_en').notNull().defaultNow(),
});
