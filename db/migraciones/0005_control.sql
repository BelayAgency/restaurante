CREATE TABLE "alertas_vistas" (
	"clave" text PRIMARY KEY NOT NULL,
	"vista_por_id" text,
	"vista_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracion_control" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"umbrales" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motivos_autorizacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion" text NOT NULL,
	"texto" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reglas_autorizacion" (
	"accion" text PRIMARY KEY NOT NULL,
	"roles" text[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alertas_vistas" ADD CONSTRAINT "alertas_vistas_vista_por_id_usuarios_id_fk" FOREIGN KEY ("vista_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Supuesto hasta relevar con el cliente: motivos de uso común. Se editan desde Control.
INSERT INTO "motivos_autorizacion" ("accion", "texto", "orden") VALUES
  ('anular_item', 'Error de carga', 0), ('anular_item', 'El cliente cambió el pedido', 1), ('anular_item', 'Demora en cocina', 2), ('anular_item', 'Plato devuelto', 3),
  ('descuento', 'Cliente habitual', 0), ('descuento', 'Compensación por un problema', 1), ('descuento', 'Promoción', 2),
  ('cortesia', 'Invitación de la casa', 0), ('cortesia', 'Compensación por un problema', 1), ('cortesia', 'Personal', 2),
  ('cambiar_precio', 'Precio mal cargado en la carta', 0), ('cambiar_precio', 'Precio acordado con el cliente', 1),
  ('reabrir_cuenta', 'Cobro mal registrado', 0), ('reabrir_cuenta', 'El cliente pidió algo más', 1),
  ('cambiar_medio_pago', 'Se cargó otro medio', 0), ('cambiar_medio_pago', 'El cliente cambió cómo paga', 1),
  ('modificar_tras_precuenta', 'El cliente pidió algo más', 0), ('modificar_tras_precuenta', 'Error en la precuenta', 1),
  ('cerrar_sin_cobrar', 'El cliente se fue sin pagar', 0), ('cerrar_sin_cobrar', 'Cuenta de la casa', 1),
  ('salida_caja', 'Depósito en el banco', 0), ('salida_caja', 'Pago a proveedor', 1), ('salida_caja', 'Gasto menor', 2);
--> statement-breakpoint
INSERT INTO "configuracion_control" ("id", "umbrales") VALUES (1, '{"minutosMesaAbierta": 180, "porcentajeDescuento": 15, "diferenciaCajaCentavos": 100000, "diferenciaConteoCentavos": 500000, "horaApertura": 11, "horaCierre": 2}');
