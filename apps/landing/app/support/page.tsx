import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Soporte | Happy Circles',
  description: 'Soporte, cuenta y solicitudes de datos de Happy Circles.',
};

export default function SupportPage() {
  return (
    <main className="legalShell">
      <article className="legalDocument">
        <Link className="legalBack" href="/">
          Happy Circles
        </Link>

        <header className="legalHeader">
          <h1>Soporte</h1>
          <p className="legalUpdated">
            Respondemos solicitudes relacionadas con cuenta, datos, acceso y privacidad.
          </p>
        </header>

        <section className="legalSection">
          <h2>Contacto</h2>
          <p>
            Escribe a <a href="mailto:soporte@happy-circles.com">soporte@happy-circles.com</a> con
            el correo asociado a tu cuenta y una descripcion clara de lo que necesitas.
          </p>
        </section>

        <section className="legalSection">
          <h2>Eliminacion de cuenta y datos</h2>
          <p>
            Puedes solicitar la eliminacion de tu cuenta y de tus datos personales desde esta pagina
            escribiendo a <a href="mailto:soporte@happy-circles.com">soporte@happy-circles.com</a>.
            Incluye el correo de tu cuenta para que podamos verificar la solicitud.
          </p>
          <p>
            Tambien puedes iniciar la eliminacion desde la app en Perfil &gt; Eliminar cuenta.
            Happy Circles anonimiza los datos personales de perfil y conserva solo los registros
            minimos necesarios para integridad financiera, prevencion de abuso, auditoria y soporte
            de disputas.
          </p>
        </section>

        <section className="legalSection">
          <h2>Privacidad y terminos</h2>
          <p>
            Tambien puedes revisar la <Link href="/privacy">politica de privacidad</Link> y los{' '}
            <Link href="/terms">terminos de servicio</Link>.
          </p>
        </section>
      </article>
    </main>
  );
}
