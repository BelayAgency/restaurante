CREATE TYPE "public"."tipo_insumo" AS ENUM('compra', 'preparacion');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('venta_teorica', 'compra', 'produccion_salida', 'produccion_entrada', 'transferencia_salida', 'transferencia_entrada', 'merma', 'vencimiento', 'comida_personal', 'ajuste_conteo');--> statement-breakpoint
CREATE TYPE "public"."unidad_base" AS ENUM('g', 'ml', 'u');--> statement-breakpoint
CREATE TABLE "compras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"deposito_id" uuid NOT NULL,
	"numero_factura" text NOT NULL,
	"fecha" text NOT NULL,
	"total_centavos" bigint NOT NULL,
	"registrada_por_id" text,
	"registrada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conteos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deposito_id" uuid NOT NULL,
	"alcance" text NOT NULL,
	"abierto_por_id" text,
	"abierto_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrado_por_id" text,
	"cerrado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "depositos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"de_venta" boolean DEFAULT false NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "historial_costos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "historial_costos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"insumo_id" uuid NOT NULL,
	"costo_unitario" numeric(18, 6) NOT NULL,
	"motivo" text NOT NULL,
	"referencia_id" text,
	"desde" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insumos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_insumo" DEFAULT 'compra' NOT NULL,
	"unidad" "unidad_base" NOT NULL,
	"stock_minimo" numeric(18, 4) DEFAULT 0 NOT NULL,
	"costo_unitario" numeric(18, 6) DEFAULT 0 NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lineas_compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compra_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"presentacion_id" uuid,
	"cantidad_presentaciones" numeric(18, 4) NOT NULL,
	"cantidad_base" numeric(18, 4) NOT NULL,
	"costo_centavos" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineas_conteo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conteo_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"contado" numeric(18, 4),
	"teorico" numeric(18, 4)
);
--> statement-breakpoint
CREATE TABLE "lineas_receta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receta_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"merma_porcentaje" numeric(5, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insumo_id" uuid NOT NULL,
	"deposito_id" uuid NOT NULL,
	"tipo" "tipo_movimiento" NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"costo_unitario" numeric(18, 6) NOT NULL,
	"motivo" text,
	"referencia_tipo" text,
	"referencia_id" text,
	"actor_id" text,
	"ocurrido_en" timestamp with time zone NOT NULL,
	"registrado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insumo_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"cantidad_base" numeric(18, 4) NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"cuit" text,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recetas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto_id" uuid,
	"preparacion_id" uuid,
	"rendimiento" numeric(18, 4) DEFAULT 1 NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone,
	"creado_por_id" text
);
--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_deposito_id_depositos_id_fk" FOREIGN KEY ("deposito_id") REFERENCES "public"."depositos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_registrada_por_id_usuarios_id_fk" FOREIGN KEY ("registrada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_deposito_id_depositos_id_fk" FOREIGN KEY ("deposito_id") REFERENCES "public"."depositos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_abierto_por_id_usuarios_id_fk" FOREIGN KEY ("abierto_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_cerrado_por_id_usuarios_id_fk" FOREIGN KEY ("cerrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_costos" ADD CONSTRAINT "historial_costos_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineas_compra" ADD CONSTRAINT "lineas_compra_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineas_compra" ADD CONSTRAINT "lineas_compra_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineas_compra" ADD CONSTRAINT "lineas_compra_presentacion_id_presentaciones_id_fk" FOREIGN KEY ("presentacion_id") REFERENCES "public"."presentaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineas_conteo" ADD CONSTRAINT "lineas_conteo_conteo_id_conteos_id_fk" FOREIGN KEY ("conteo_id") REFERENCES "public"."conteos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineas_conteo" ADD CONSTRAINT "lineas_conteo_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineas_receta" ADD CONSTRAINT "lineas_receta_receta_id_recetas_id_fk" FOREIGN KEY ("receta_id") REFERENCES "public"."recetas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineas_receta" ADD CONSTRAINT "lineas_receta_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_deposito_id_depositos_id_fk" FOREIGN KEY ("deposito_id") REFERENCES "public"."depositos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentaciones" ADD CONSTRAINT "presentaciones_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_preparacion_id_insumos_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historial_costos_insumo_idx" ON "historial_costos" USING btree ("insumo_id","desde");--> statement-breakpoint
CREATE UNIQUE INDEX "lineas_conteo_idx" ON "lineas_conteo" USING btree ("conteo_id","insumo_id");--> statement-breakpoint
CREATE INDEX "lineas_receta_idx" ON "lineas_receta" USING btree ("receta_id");--> statement-breakpoint
CREATE INDEX "movimientos_insumo_idx" ON "movimientos_stock" USING btree ("insumo_id","deposito_id");--> statement-breakpoint
CREATE INDEX "movimientos_fecha_idx" ON "movimientos_stock" USING btree ("ocurrido_en");--> statement-breakpoint
CREATE UNIQUE INDEX "movimientos_referencia_idx" ON "movimientos_stock" USING btree ("referencia_tipo","referencia_id","insumo_id","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "receta_producto_vigente_idx" ON "recetas" USING btree ("producto_id") WHERE "recetas"."archivado_en" is null and "recetas"."producto_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "receta_preparacion_vigente_idx" ON "recetas" USING btree ("preparacion_id") WHERE "recetas"."archivado_en" is null and "recetas"."preparacion_id" is not null;--> statement-breakpoint
CREATE TRIGGER movimientos_inmutables BEFORE UPDATE OR DELETE ON movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER movimientos_sin_truncate BEFORE TRUNCATE ON movimientos_stock
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
-- Supuesto hasta relevar: los depósitos del pedido. La cocina es de donde sale lo vendido.
INSERT INTO "depositos" ("nombre", "de_venta") VALUES ('Cocina', true), ('Cámara', false), ('Barra', false), ('Bodega', false);
