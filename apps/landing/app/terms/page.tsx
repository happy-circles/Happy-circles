import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terminos de servicio | Happy Circles',
  description: 'Terminos de servicio de Happy Circles para Colombia.',
};

export default function TermsPage() {
  return (
    <main className="legalShell">
      <article className="legalDocument">
        <Link className="legalBack" href="/">
          Happy Circles
        </Link>

        <header className="legalHeader">
          <h1>Terminos de servicio</h1>
          <p className="legalUpdated">Ultima actualizacion: 2026-05-02</p>
        </header>

        <section className="legalSection">
          <h2>Servicio</h2>
          <p>
            Happy Circles ayuda a registrar y conciliar saldos entre personas de confianza. La app
            no es un banco, billetera, procesador de pagos, servicio de credito ni asesor
            financiero.
          </p>
        </section>

        <section className="legalSection">
          <h2>Responsabilidad del usuario</h2>
          <ul>
            <li>Debes usar informacion real y mantener segura tu cuenta.</li>
            <li>
              Solo debes registrar solicitudes y saldos que puedas justificar frente a la otra
              persona.
            </li>
            <li>
              Las decisiones de aceptar, rechazar, enmendar o cerrar saldos son responsabilidad de
              los usuarios involucrados.
            </li>
            <li>
              No debes usar Happy Circles para fraude, acoso, lavado de activos o actividades
              ilegales.
            </li>
          </ul>
        </section>

        <section className="legalSection">
          <h2>Disponibilidad y cambios</h2>
          <p>
            Podemos actualizar funciones, corregir errores, limitar cuentas abusivas o suspender el
            servicio por mantenimiento, seguridad o cumplimiento legal.
          </p>
        </section>

        <section className="legalSection">
          <h2>Cuenta y eliminacion</h2>
          <p>
            Puedes cerrar sesion, revocar dispositivos y solicitar eliminacion de cuenta desde la
            app. Al eliminar la cuenta, se anonimiza la informacion personal y se conserva el ledger
            minimo necesario para integridad financiera.
          </p>
        </section>

        <section className="legalSection">
          <h2>Ley aplicable</h2>
          <p>
            Estos terminos estan pensados para la primera publicacion en Colombia. Cualquier version
            final debe ser revisada y aprobada legalmente antes de promocionar la app a produccion.
          </p>
        </section>

        <section className="legalSection">
          <h2>Contacto</h2>
          <p>
            Para soporte o preguntas sobre estos terminos, escribe a{' '}
            <a href="mailto:soporte@happy-circles.com">soporte@happy-circles.com</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
