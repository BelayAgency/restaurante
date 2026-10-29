CREATE TABLE "dias_operativos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"abierto_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrado_en" timestamp with time zone,
	"cerrado_por_id" text,
	"totales" jsonb
);
--> statement-breakpoint
CREATE TABLE "medios_pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"efectivo" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "dia_operativo_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "posterior_al_cierre" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dias_operativos" ADD CONSTRAINT "dias_operativos_cerrado_por_id_usuarios_id_fk" FOREIGN KEY ("cerrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Supuesto hasta relevar con el cliente: los medios de siempre. Se editan desde la caja.
INSERT INTO "medios_pago" ("nombre", "efectivo", "orden") VALUES
  ('Efectivo', true, 0), ('Débito', false, 1), ('Crédito', false, 2), ('Transferencia', false, 3), ('QR', false, 4);
--> statement-breakpoint
-- Un único día abierto a la vez.
CREATE UNIQUE INDEX "dias_operativos_abierto_idx" ON "dias_operativos" ((true)) WHERE "cerrado_en" IS NULL;
