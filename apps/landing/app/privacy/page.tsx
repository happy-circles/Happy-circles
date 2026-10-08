import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de privacidad | Happy Circles',
  description: 'Política de privacidad de Happy Circles para Colombia.',
};

export default function PrivacyPage() {
  return (
    <main className="legalShell">
      <article className="legalDocument">
        <Link className="legalBack" href="/">
          Happy Circles
        </Link>

        <header className="legalHeader">
          <h1>Política de privacidad</h1>
          <p className="legalUpdated">Última actualización: 2026-10-07</p>
        </header>

        <section className="legalSection">
          <h2>Datos que tratamos</h2>
          <p>
            Happy Circles usa datos necesarios para crear tu cuenta, conectar con personas de
            confianza y llevar saldos entre usuarios.
          </p>
          <ul>
            <li>Identidad de cuenta: correo, nombre visible, teléfono y proveedores de acceso.</li>
            <li>
              Contactos opcionales: teléfonos de tu agenda para buscar coincidencias y teléfonos o
              alias que eliges usar para preparar invitaciones.
            </li>
            <li>Contenido opcional: foto o avatar de perfil.</li>
            <li>
              Seguridad: identificadores de sesión, dispositivo confiable y estado de biometría.
            </li>
            <li>Uso del producto: eventos técnicos propios para operar y mejorar la app.</li>
            <li>
              Datos financieros entre usuarios: solicitudes, saldos, historial, auditoría y cierres.
            </li>
          </ul>
        </section>

        <section className="legalSection">
          <h2>Como usamos los datos</h2>
          <p>
            Usamos estos datos para autenticarte, proteger acciones sensibles, mostrar saldos,
            enviar o resolver invitaciones, mantener auditoría financiera y dar soporte. No vendemos
            datos personales ni usamos publicidad comportamental.
          </p>
        </section>

        <section className="legalSection">
          <h2>Descubrimiento de contactos</h2>
          <p>
            Usar tu agenda es opcional. Si permites el acceso, enviamos los números de teléfono de
            los contactos cargados a Supabase, nuestro proveedor de infraestructura, para buscar
            coincidencias con cuentas cuyo teléfono está habilitado para esta función. También
            puedes conectar con otras personas mediante QR o invitaciones sin dar acceso a tu
            agenda. Buscar contactos no envía SMS ni invitaciones automáticamente.
          </p>
          <p>
            Para actualizar las coincidencias mientras usas esta pantalla, el servidor guarda
            huellas criptográficas de los teléfonos (HMAC), asociadas a tu cuenta y a la sesión de
            búsqueda. La sesión caduca 15 minutos después de la última búsqueda o renovación y puede
            renovarse mientras la pantalla sigue activa. Al cerrar la pantalla, la app pide eliminar
            esa sesión; el servidor también elimina periódicamente las sesiones caducadas y sus
            huellas.
          </p>
          <p>
            Esta búsqueda no envía los nombres de tus contactos ni guarda en el servidor una copia
            de tu agenda con nombres y números en texto legible. Los nombres se procesan en tu
            dispositivo. Si preparas una invitación, sí usamos el teléfono y el alias que eliges
            para gestionarla.
          </p>
        </section>

        <section className="legalSection">
          <h2>Retención y eliminación</h2>
          <p>
            Puedes solicitar eliminar tu cuenta desde Perfil. Al hacerlo, anonimizamos tus datos
            personales, revocamos dispositivos y cerramos la sesión. Conservamos historial y
            auditoría mínima cuando sea necesario para integridad financiera, prevención de abuso y
            soporte de disputas entre usuarios.
          </p>
        </section>

        <section className="legalSection">
          <h2>Terceros</h2>
          <p>
            La app usa proveedores de infraestructura, autenticación, correo transaccional y tiendas
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
