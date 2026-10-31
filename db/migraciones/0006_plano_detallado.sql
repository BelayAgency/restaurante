ALTER TYPE "public"."tipo_elemento_plano" ADD VALUE 'ventana';--> statement-breakpoint
ALTER TYPE "public"."tipo_elemento_plano" ADD VALUE 'bano';--> statement-breakpoint
ALTER TYPE "public"."tipo_elemento_plano" ADD VALUE 'caja';--> statement-breakpoint
ALTER TYPE "public"."tipo_elemento_plano" ADD VALUE 'planta';--> statement-breakpoint
ALTER TYPE "public"."tipo_elemento_plano" ADD VALUE 'texto';--> statement-breakpoint
ALTER TABLE "elementos_plano" ADD COLUMN "etiqueta" text;