CREATE TYPE "public"."forma_elemento" AS ENUM('redonda', 'rectangular');--> statement-breakpoint
CREATE TYPE "public"."tipo_elemento_plano" AS ENUM('mesa', 'pared', 'barra', 'columna', 'puerta', 'cocina');--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "elementos_plano" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sector_id" uuid NOT NULL,
	"tipo" "tipo_elemento_plano" NOT NULL,
	"forma" "forma_elemento" DEFAULT 'rectangular' NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"ancho" integer NOT NULL,
	"alto" integer NOT NULL,
	"rotacion" integer DEFAULT 0 NOT NULL,
	"numero_mesa" integer,
	"capacidad" integer,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "estaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grupos_modificador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"obligatorio" boolean DEFAULT false NOT NULL,
	"multiple" boolean DEFAULT false NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "modificadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"precio_centavos" bigint DEFAULT 0 NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "precios_producto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto_id" uuid NOT NULL,
	"precio_centavos" bigint NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone,
	"creado_por_id" text
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"estacion_id" uuid NOT NULL,
	"disponible" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "productos_grupos" (
	"producto_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sectores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"ancho" integer DEFAULT 1200 NOT NULL,
	"alto" integer DEFAULT 800 NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "elementos_plano" ADD CONSTRAINT "elementos_plano_sector_id_sectores_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modificadores" ADD CONSTRAINT "modificadores_grupo_id_grupos_modificador_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_modificador"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios_producto" ADD CONSTRAINT "precios_producto_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios_producto" ADD CONSTRAINT "precios_producto_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_estacion_id_estaciones_id_fk" FOREIGN KEY ("estacion_id") REFERENCES "public"."estaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_grupos" ADD CONSTRAINT "productos_grupos_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_grupos" ADD CONSTRAINT "productos_grupos_grupo_id_grupos_modificador_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_modificador"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "elementos_sector_idx" ON "elementos_plano" USING btree ("sector_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mesas_numero_activo_idx" ON "elementos_plano" USING btree ("numero_mesa") WHERE "elementos_plano"."tipo" = 'mesa' and "elementos_plano"."archivado_en" is null;--> statement-breakpoint
CREATE INDEX "modificadores_grupo_idx" ON "modificadores" USING btree ("grupo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "precio_vigente_idx" ON "precios_producto" USING btree ("producto_id") WHERE "precios_producto"."archivado_en" is null;--> statement-breakpoint
CREATE INDEX "productos_categoria_idx" ON "productos" USING btree ("categoria_id");--> statement-breakpoint
CREATE UNIQUE INDEX "productos_grupos_idx" ON "productos_grupos" USING btree ("producto_id","grupo_id");