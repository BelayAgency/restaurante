CREATE TYPE "public"."dueno_adjunto" AS ENUM('compra', 'pago_proveedor');--> statement-breakpoint
CREATE TYPE "public"."forma_pago_proveedor" AS ENUM('efectivo', 'transferencia', 'cheque', 'tarjeta');--> statement-breakpoint
CREATE TYPE "public"."tipo_comprobante_compra" AS ENUM('factura', 'nota_credito');--> statement-breakpoint
CREATE TABLE "adjuntos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dueno_tipo" "dueno_adjunto" NOT NULL,
	"dueno_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"contenido" "bytea" NOT NULL,
	"subido_por_id" text,
	"subido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos_proveedor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"importe_centavos" bigint NOT NULL,
	"forma" "forma_pago_proveedor" NOT NULL,
	"observacion" text,
	"registrado_por_id" text,
	"registrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_en" timestamp with time zone,
	"anulado_por_id" text,
	"motivo_anulacion" text
);
--> statement-breakpoint
CREATE TABLE "revisiones_compra" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "revisiones_compra_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"compra_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"anterior" jsonb NOT NULL,
	"corregida_por_id" text,
	"corregida_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compras" ALTER COLUMN "deposito_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "compras" ADD COLUMN "tipo" "tipo_comprobante_compra" DEFAULT 'factura' NOT NULL;--> statement-breakpoint
ALTER TABLE "compras" ADD COLUMN "observacion" text;--> statement-breakpoint
ALTER TABLE "compras" ADD COLUMN "en_reclamo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "compras" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "compras" ADD COLUMN "anulada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compras" ADD COLUMN "anulada_por_id" text;--> statement-breakpoint
ALTER TABLE "compras" ADD COLUMN "motivo_anulacion" text;--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_subido_por_id_usuarios_id_fk" FOREIGN KEY ("subido_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_anulado_por_id_usuarios_id_fk" FOREIGN KEY ("anulado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_compra" ADD CONSTRAINT "revisiones_compra_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_compra" ADD CONSTRAINT "revisiones_compra_corregida_por_id_usuarios_id_fk" FOREIGN KEY ("corregida_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "adjuntos_dueno_idx" ON "adjuntos" USING btree ("dueno_tipo","dueno_id");--> statement-breakpoint
CREATE INDEX "pagos_proveedor_idx" ON "pagos_proveedor" USING btree ("proveedor_id","fecha");--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_anulada_por_id_usuarios_id_fk" FOREIGN KEY ("anulada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compras_proveedor_idx" ON "compras" USING btree ("proveedor_id","fecha");