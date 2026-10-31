ALTER TYPE "public"."unidad_base" ADD VALUE 'parte';--> statement-breakpoint
ALTER TABLE "insumos" ADD COLUMN "contenido_por_unidad" numeric(18, 4);