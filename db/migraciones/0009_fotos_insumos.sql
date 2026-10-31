CREATE TABLE "fotos_insumo" (
	"insumo_id" uuid PRIMARY KEY NOT NULL,
	"imagen" "bytea" NOT NULL,
	"tipo" text NOT NULL,
	"version" uuid DEFAULT gen_random_uuid() NOT NULL,
	"subida_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fotos_insumo" ADD CONSTRAINT "fotos_insumo_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;