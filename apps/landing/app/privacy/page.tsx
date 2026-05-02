import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politica de privacidad | Happy Circles',
  description: 'Politica de privacidad de Happy Circles para Colombia.',
};

export default function PrivacyPage() {
  return (
    <main className="legalShell">
      <article className="legalDocument">
        <Link className="legalBack" href="/">
          Happy Circles
        </Link>

        <header className="legalHeader">
          <h1>Politica de privacidad</h1>
          <p className="legalUpdated">Ultima actualizacion: 2026-05-02</p>
        </header>

        <section className="legalSection">
          <h2>Datos que tratamos</h2>
          <p>
            Happy Circles usa datos necesarios para crear tu cuenta, conectar con personas de
            confianza y llevar saldos entre usuarios.
          </p>
          <ul>
            <li>Identidad de cuenta: correo, nombre visible, telefono y proveedores de acceso.</li>
            <li>
              Contactos opcionales: telefonos o alias que eliges usar para preparar invitaciones.
            </li>
            <li>Contenido opcional: foto o avatar de perfil.</li>
            <li>
              Seguridad: identificadores de sesion, dispositivo confiable y estado de biometria.
            </li>
            <li>Uso del producto: eventos tecnicos propios para operar y mejorar la app.</li>
            <li>
              Datos financieros entre usuarios: solicitudes, saldos, ledger, auditoria y cierres.
            </li>
          </ul>
        </section>

        <section className="legalSection">
          <h2>Como usamos los datos</h2>
          <p>
            Usamos estos datos para autenticarte, proteger acciones sensibles, mostrar saldos,
            enviar o resolver invitaciones, mantener auditoria financiera y dar soporte. No vendemos
            datos personales ni usamos publicidad comportamental.
          </p>
        </section>

        <section className="legalSection">
          <h2>Retencion y eliminacion</h2>
          <p>
            Puedes solicitar eliminar tu cuenta desde Perfil. Al hacerlo, anonimizamos tus datos
            personales, revocamos dispositivos y cerramos la sesion. Conservamos ledger y auditoria
            minima cuando sea necesario para integridad financiera, prevencion de abuso y soporte de
            disputas entre usuarios.
          </p>
        </section>

        <section className="legalSection">
          <h2>Terceros</h2>
          <p>
            La app usa proveedores de infraestructura, autenticacion, correo transaccional y tiendas
            de aplicaciones. Estos proveedores procesan datos solo para prestar el servicio y bajo
            sus propias medidas de seguridad.
          </p>
        </section>

        <section className="legalSection">
          <h2>Contacto</h2>
          <p>
            Para ejercer derechos sobre tus datos o pedir soporte, escribe a{' '}
            <a href="mailto:soporte@happy-circles.com">soporte@happy-circles.com</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
