import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Soporte | Happy Circles',
  description: 'Canal de soporte de Happy Circles.',
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
            Respondemos solicitudes relacionadas con cuenta, datos y acceso.
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
          <h2>Cuenta y privacidad</h2>
          <p>
            También puedes revisar la <Link href="/privacy">política de privacidad</Link> y los{' '}
            <Link href="/terms">términos de servicio</Link>.
          </p>
        </section>
      </article>
    </main>
  );
}
