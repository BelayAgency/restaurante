import { Suspense, type ReactNode } from 'react';
import { cookies } from 'next/headers';
import { CartelNuevaVersion } from '@/components/cartel-nueva-version';
import { CartelPago } from '@/components/cartel-pago';
import { Esqueleto } from '@/components/carga';
import { Marco } from '@/components/marco';
import { esRol } from '@/dominio/roles';
import { NOMBRE_SISTEMA } from '@/lib/marca';
import { leerServicioBelay } from '@/lib/servicio-belay';
import { alternaVistas, usuarioDePagina } from '@/lib/sesion';
import { ProveedorAutorizacion } from './autorizacion';
import { EsperaSync } from './espera-sync';
import { MotorSync } from './motor-sync';
import { Navegacion } from './navegacion';
import { PieUsuario } from './pie-usuario';
import { ProveedorSesion } from './sesion-cliente';
import { RegistroServiceWorker } from './registro-sw';

async function MarcoAutenticado({ children }: { children: ReactNode }) {
  const usuario = await usuarioDePagina();
  const servicio = await leerServicioBelay();
  const vistaGuardada = (await cookies()).get('vista-rol')?.value;
  const vista = alternaVistas(usuario) && esRol(vistaGuardada) ? vistaGuardada : usuario.rol;

  return (
    <>
      <CartelPago servicio={servicio} />
      <CartelNuevaVersion />
      <ProveedorSesion usuario={usuario} vista={vista}>
        <MotorSync />
        <ProveedorAutorizacion>
          <EsperaSync>
            <Marco nombreSistema={NOMBRE_SISTEMA} nav={<Navegacion />} pie={<PieUsuario />}>
              {children}
            </Marco>
          </EsperaSync>
        </ProveedorAutorizacion>
      </ProveedorSesion>
    </>
  );
}

function EsqueletoMarco() {
  return (
    <div className="marco">
      <aside className="marco-lateral">
        <div className="marco-fijo flex flex-col gap-2 px-3 py-5">
          {Array.from({ length: 4 }, (_, i) => (
            <Esqueleto key={i} className="h-8 w-full" />
          ))}
        </div>
      </aside>
      <div className="marco-principal">
        <main className="marco-contenido">
          <Esqueleto className="h-40 w-full" />
        </main>
      </div>
    </div>
  );
}

export default function LayoutApp({ children }: { children: ReactNode }) {
  // La sesión se lee en el pedido: detrás de un Suspense, el resto del
  // documento sale sin esperarla.
  return (
    <>
      <RegistroServiceWorker />
      <Suspense fallback={<EsqueletoMarco />}>
        <MarcoAutenticado>{children}</MarcoAutenticado>
      </Suspense>
    </>
  );
}
