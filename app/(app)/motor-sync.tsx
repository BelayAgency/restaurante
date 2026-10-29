'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { arrancarSync, estadoSync, estadoSyncServidor, suscribirSync } from '@/local/sync';

/** Arranca la sincronización en cuanto hay un área autenticada abierta, en cualquier pantalla. */
export function MotorSync() {
  useEffect(() => {
    void arrancarSync();
  }, []);
  return null;
}

export function useEstadoSync() {
  return useSyncExternalStore(suscribirSync, estadoSync, estadoSyncServidor);
}
