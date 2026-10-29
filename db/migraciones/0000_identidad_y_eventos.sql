CREATE TYPE "public"."proposito_codigo" AS ENUM('recuperacion', 'cambio_contrasena', 'cambio_email');--> statement-breakpoint
CREATE TYPE "public"."resultado_evento" AS ENUM('aceptado', 'rechazado');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"accion" text NOT NULL,
	"actor_id" text,
	"actor_es_soporte" boolean DEFAULT false NOT NULL,
	"objetivo_tipo" text NOT NULL,
	"objetivo_id" text NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codigos_verificacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" text NOT NULL,
	"proposito" "proposito_codigo" NOT NULL,
	"codigo_hash" text NOT NULL,
	"destinatario" text NOT NULL,
	"solicitado_por_id" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"verificado_en" timestamp with time zone,
	"usado_en" timestamp with time zone,
	"anulado_en" timestamp with time zone,
	"vence_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuentas_auth" (
	"id" text PRIMARY KEY NOT NULL,
	"id_cuenta" text NOT NULL,
	"id_proveedor" text NOT NULL,
	"usuario_id" text NOT NULL,
	"token_acceso" text,
	"token_refresco" text,
	"token_id" text,
	"token_acceso_vence_en" timestamp with time zone,
	"token_refresco_vence_en" timestamp with time zone,
	"alcance" text,
	"contrasena" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispositivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"registrado_por_id" text,
	"registrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_contacto" timestamp with time zone,
	"desfase_reloj_ms" integer,
	"revocado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"secuencia" bigint GENERATED ALWAYS AS IDENTITY (sequence name "eventos_secuencia_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tipo" text NOT NULL,
	"version" integer NOT NULL,
	"agregado_tipo" text NOT NULL,
	"agregado_id" text NOT NULL,
	"datos" jsonb NOT NULL,
	"operador_id" text NOT NULL,
	"autorizado_por_id" text,
	"motivo_id" text,
	"motivo_texto" text,
	"dispositivo_id" uuid NOT NULL,
	"sesion_usuario_id" text NOT NULL,
	"creado_en_dispositivo" timestamp with time zone NOT NULL,
	"recibido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resultado" "resultado_evento" NOT NULL,
	"motivo_rechazo" text
);
--> statement-breakpoint
CREATE TABLE "intentos_acceso" (
	"email" text PRIMARY KEY NOT NULL,
	"fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pines_operador" (
	"usuario_id" text PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"agente_usuario" text,
	"usuario_id" text NOT NULL,
	CONSTRAINT "sesiones_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"email_verificado" boolean DEFAULT false NOT NULL,
	"foto" text,
	"rol" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"es_soporte" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificaciones" (
	"id" text PRIMARY KEY NOT NULL,
	"identificador" text NOT NULL,
	"valor" text NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_actor_id_usuarios_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codigos_verificacion" ADD CONSTRAINT "codigos_verificacion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codigos_verificacion" ADD CONSTRAINT "codigos_verificacion_solicitado_por_id_usuarios_id_fk" FOREIGN KEY ("solicitado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_auth" ADD CONSTRAINT "cuentas_auth_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pines_operador" ADD CONSTRAINT "pines_operador_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_objetivo_idx" ON "auditoria" USING btree ("objetivo_tipo","objetivo_id");--> statement-breakpoint
CREATE INDEX "auditoria_fecha_idx" ON "auditoria" USING btree ("ocurrido_en");--> statement-breakpoint
CREATE INDEX "codigos_usuario_idx" ON "codigos_verificacion" USING btree ("usuario_id","proposito");--> statement-breakpoint
CREATE INDEX "cuentas_auth_usuario_idx" ON "cuentas_auth" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_secuencia_idx" ON "eventos" USING btree ("secuencia");--> statement-breakpoint
CREATE INDEX "eventos_agregado_idx" ON "eventos" USING btree ("agregado_tipo","agregado_id");--> statement-breakpoint
CREATE INDEX "eventos_rechazados_idx" ON "eventos" USING btree ("recibido_en") WHERE "eventos"."resultado" = 'rechazado';--> statement-breakpoint
CREATE INDEX "sesiones_usuario_idx" ON "sesiones" USING btree ("usuario_id");