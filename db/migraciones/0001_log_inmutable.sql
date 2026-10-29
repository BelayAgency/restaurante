-- El log de eventos y la auditoría no se corrigen: se les agrega. El rol de la
-- app es dueño de las tablas y por eso un REVOKE no alcanza; el trigger sí.
CREATE FUNCTION rechazar_modificacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es append-only: % no está permitido', TG_TABLE_NAME, TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER eventos_inmutables BEFORE UPDATE OR DELETE ON eventos
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER eventos_sin_truncate BEFORE TRUNCATE ON eventos
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER auditoria_sin_truncate BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
-- Avisa a los procesos que sirven el canal en vivo: los dispositivos conectados
-- hacen pull desde su cursor. El payload es sólo la secuencia, nunca datos.
CREATE FUNCTION avisar_evento() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('eventos_nuevos', NEW.secuencia::text);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER eventos_aviso AFTER INSERT ON eventos
  FOR EACH ROW EXECUTE FUNCTION avisar_evento();
