CREATE TYPE "public"."estado_reserva" AS ENUM('pendiente', 'sentada', 'no_vino', 'cancelada');--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre_cliente" text NOT NULL,
	"telefono" text,
	"personas" integer NOT NULL,
	"reservada_para" timestamp with time zone NOT NULL,
	"nota" text,
	"estado_reserva" "estado_reserva" DEFAULT 'pendiente' NOT NULL,
	"cuenta_id" text,
	"creada_por_id" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelta_por_id" text,
	"resuelta_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_creada_por_id_usuarios_id_fk" FOREIGN KEY ("creada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_resuelta_por_id_usuarios_id_fk" FOREIGN KEY ("resuelta_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservas_para_idx" ON "reservas" USING btree ("reservada_para");