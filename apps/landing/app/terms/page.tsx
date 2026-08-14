import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Términos y condiciones | Happy Circles',
  description: 'Términos y condiciones de uso de Happy Circles en Colombia.',
};

const sections = [
  ['acceptance', 'Aceptación y alcance'],
  ['eligibility', 'Requisitos para usar el servicio'],
  ['service', 'Qué hace Happy Circles'],
  ['records', 'Solicitudes, saldos y Happy Circles'],
  ['account', 'Cuenta y seguridad'],
  ['user-content', 'Información y contenido del usuario'],
  ['acceptable-use', 'Uso permitido'],
  ['availability', 'Disponibilidad y cambios'],
  ['third-parties', 'Servicios de terceros'],
  ['intellectual-property', 'Propiedad intelectual'],
  ['termination', 'Suspensión y terminación'],
  ['responsibility', 'Responsabilidad'],
  ['consumer-rights', 'Derechos del consumidor'],
  ['privacy', 'Privacidad y eliminación de cuenta'],
  ['changes', 'Cambios a estos términos'],
  ['law', 'Ley aplicable y controversias'],
  ['contact', 'Contacto del proyecto'],
] as const;

export default function TermsPage() {
  return (
    <main className="legalShell">
      <article className="legalDocument">
        <Link className="legalBack" href="/">
          Happy Circles
        </Link>

        <header className="legalHeader">
          <h1>Términos y condiciones</h1>
          <p className="legalUpdated">Vigentes desde el 10 de agosto de 2026</p>
          <p>
            Estos términos regulan el acceso y uso de la aplicación móvil, el sitio web y los
            servicios relacionados de Happy Circles (en conjunto, el “Servicio”) en Colombia. Léelos
            antes de crear una cuenta o usar el Servicio.
          </p>
        </header>

        <nav aria-label="Contenido de los términos" className="legalContents">
          <h2>Contenido</h2>
          <ol>
            {sections.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <section className="legalSection" id="acceptance">
          <h2>1. Aceptación y alcance</h2>
          <p>
            Al crear una cuenta o usar el Servicio confirmas que leíste y aceptas estos términos y
            nuestra <Link href="/privacy">Política de privacidad</Link>. Si no estás de acuerdo, no
            crees una cuenta ni uses el Servicio.
          </p>
          <p>
            Las condiciones particulares que se muestren claramente antes de una función o
            transacción también harán parte del acuerdo aplicable a esa función. Ninguna disposición
            de estos términos limita derechos irrenunciables reconocidos por la ley.
          </p>
        </section>

        <section className="legalSection" id="eligibility">
          <h2>2. Requisitos para usar el servicio</h2>
          <p>
            Debes tener al menos 18 años y capacidad legal para obligarte. El Servicio está dirigido
            a personas ubicadas en Colombia que administran saldos privados con personas que ya
            conocen y en quienes confían. No está diseñado para uso empresarial, contable o
            profesional ni para operar en nombre de terceros sin autorización.
          </p>
        </section>

        <section className="legalSection" id="service">
          <h2>3. Qué hace Happy Circles</h2>
          <p>
            Happy Circles permite enviar invitaciones, proponer y confirmar solicitudes de dinero,
            consultar saldos e historial entre usuarios y proponer círculos que reduzcan saldos
            recíprocos. Happy Circles es actualmente un proyecto independiente, sin explotación
            comercial, y el Servicio se ofrece sin costo. Si esto cambia, informaremos previamente
            el precio, las condiciones aplicables y la identificación del proveedor responsable.
          </p>
          <p>
            Happy Circles no es un banco, billetera digital, entidad financiera, procesador de
            pagos, servicio de crédito, cobranza, giro, depósito, inversión ni asesoría financiera,
            legal o contable. No custodia, presta, transfiere ni recibe dinero, no cobra intereses y
            no garantiza el pago de saldos registrados entre usuarios.
          </p>
        </section>

        <section className="legalSection" id="records">
          <h2>4. Solicitudes, saldos y Happy Circles</h2>
          <ul>
            <li>
              Una solicitud no modifica un saldo hasta que la persona destinataria la acepta. Esa
              persona puede aceptarla, rechazarla o proponer una modificación.
            </li>
            <li>
              Los registros aceptados representan lo declarado por los usuarios; no son recibos,
              títulos valores, extractos bancarios ni prueba independiente de un pago o de una
              deuda.
            </li>
            <li>
              Los movimientos confirmados se conservan en un historial de auditoría. Las
              correcciones se realizan mediante nuevos movimientos y no borrando el historial
              anterior.
            </li>
            <li>
              Un círculo de saldos es una propuesta calculada a partir de registros aceptados. Solo
              se ejecuta cuando se cumplen las aprobaciones mostradas en la aplicación y su
              resultado crea movimientos de ajuste entre los participantes; no mueve dinero fuera
              del Servicio.
            </li>
            <li>
              Los valores se muestran en pesos colombianos (COP). Cada usuario debe verificar
              persona, concepto, dirección y valor antes de confirmar una acción.
            </li>
          </ul>
          <p>
            Los usuarios son los únicos responsables de acordar y realizar pagos reales por fuera
            del Servicio y de resolver desacuerdos sobre el origen, existencia o pago de una
            obligación.
          </p>
        </section>

        <section className="legalSection" id="account">
          <h2>5. Cuenta y seguridad</h2>
          <p>
            Debes proporcionar información exacta y actualizada, mantener la confidencialidad de tus
            credenciales y proteger tus dispositivos. La cuenta es personal e intransferible. Debes
            avisarnos de inmediato si sospechas un acceso no autorizado y revisar tus registros con
            regularidad. Las medidas locales como biometría o dispositivo confiable añaden
            protección, pero no reemplazan tus deberes de seguridad.
          </p>
        </section>

        <section className="legalSection" id="user-content">
          <h2>6. Información y contenido del usuario</h2>
          <p>
            Conservas los derechos sobre nombres, fotos, descripciones y demás contenido que
            aportes. Nos autorizas, de forma no exclusiva y solo durante el tiempo necesario, a
            alojarlo, reproducirlo, adaptarlo técnicamente y mostrarlo para operar, proteger y
            soportar el Servicio. Esta autorización termina cuando se elimina el contenido o la
            cuenta, salvo copias de respaldo y registros que debamos conservar legítimamente.
          </p>
          <p>
            Si eliges buscar o invitar contactos, declaras que tienes autorización para usar sus
            datos con ese propósito y que no enviarás comunicaciones no solicitadas. Eres
            responsable de tener derechos sobre el contenido que compartes y de que este sea exacto
            y lícito.
          </p>
        </section>

        <section className="legalSection" id="acceptable-use">
          <h2>7. Uso permitido</h2>
          <p>No puedes usar el Servicio para:</p>
          <ul>
            <li>fraude, suplantación, acoso, amenazas, extorsión o actividades ilegales;</li>
            <li>
              lavado de activos, financiación ilícita o administración de recursos de terceros;
            </li>
            <li>
              registrar obligaciones inexistentes o contenido falso, ilícito o que vulnere derechos;
            </li>
            <li>acceder sin autorización a cuentas, datos, sistemas o medidas de seguridad;</li>
            <li>
              introducir código malicioso, automatizar accesos abusivos, interferir con el Servicio
              o intentar descubrir su código fuente salvo cuando la ley lo permita; o
            </li>
            <li>
              revender, sublicenciar o explotar comercialmente el Servicio sin autorización escrita.
            </li>
          </ul>
        </section>

        <section className="legalSection" id="availability">
          <h2>8. Disponibilidad y cambios del servicio</h2>
          <p>
            Procuramos mantener el Servicio disponible y seguro, pero pueden presentarse
            interrupciones por mantenimiento, fallas de internet, proveedores, fuerza mayor o
            eventos de seguridad. Podemos corregir errores, actualizar funciones o retirar
            características por razones técnicas, de seguridad o legales. Cuando un cambio material
            afecte una función contratada o un derecho del usuario, daremos la información y los
            remedios exigidos por la ley.
          </p>
        </section>

        <section className="legalSection" id="third-parties">
          <h2>9. Servicios de terceros</h2>
          <p>
            El Servicio depende de sistemas operativos, tiendas de aplicaciones y proveedores de
            autenticación, infraestructura, correo y notificaciones. Sus propios términos pueden
            aplicar cuando los utilizas. Happy Circles no controla servicios externos ni responde
            por sus interrupciones o cambios, sin perjuicio de la responsabilidad que legalmente nos
            corresponda por nuestros proveedores o por la prestación del Servicio.
          </p>
        </section>

        <section className="legalSection" id="intellectual-property">
          <h2>10. Propiedad intelectual</h2>
          <p>
            El software, diseño, marcas, textos y demás elementos propios del Servicio pertenecen a
            Happy Circles o a sus licenciantes. Te otorgamos una licencia personal, limitada, no
            exclusiva, revocable e intransferible para usar la aplicación conforme a estos términos.
            No se transfiere ningún otro derecho.
          </p>
        </section>

        <section className="legalSection" id="termination">
          <h2>11. Suspensión y terminación</h2>
          <p>
            Puedes dejar de usar el Servicio y solicitar la eliminación de tu cuenta en cualquier
            momento. Podemos restringir o suspender una cuenta cuando sea razonablemente necesario
            para investigar fraude, proteger a usuarios o al Servicio, cumplir una obligación legal
            o atender un incumplimiento de estos términos. Cuando sea posible y seguro, informaremos
            la razón y ofreceremos un canal de revisión. No modificaremos unilateralmente estos
            términos para sustraernos de obligaciones ya adquiridas.
          </p>
        </section>

        <section className="legalSection" id="responsibility">
          <h2>12. Responsabilidad</h2>
          <p>
            Happy Circles responde por la calidad e idoneidad del Servicio y por las demás
            obligaciones que imponga la ley. Sin embargo, no controla ni garantiza la veracidad de
            lo registrado por otros usuarios, la existencia jurídica de una obligación, la conducta
            de una contraparte o un pago que deba ocurrir fuera del Servicio.
          </p>
          <p>
            En la máxima medida permitida por la ley, no seremos responsables por daños ocasionados
            exclusivamente por información falsa del usuario, uso no autorizado atribuible al
            incumplimiento de sus deberes de seguridad, decisiones tomadas fuera del Servicio o
            eventos irresistibles e imprevisibles. Esta sección no excluye responsabilidad por dolo
            o culpa grave, ni garantías, indemnizaciones o derechos que legalmente no puedan
            limitarse.
          </p>
        </section>

        <section className="legalSection" id="consumer-rights">
          <h2>13. Derechos del consumidor</h2>
          <p>
            Recibirás información clara, suficiente, verificable y oportuna sobre el Servicio.
            Puedes presentar peticiones, quejas o reclamos a través de los datos de contacto
            indicados abajo. Nada en estos términos impide acudir a la Superintendencia de Industria
            y Comercio, a los jueces competentes o ejercer otros derechos previstos en el Estatuto
            del Consumidor.
          </p>
        </section>

        <section className="legalSection" id="privacy">
          <h2>14. Privacidad y eliminación de cuenta</h2>
          <p>
            El tratamiento de datos personales se explica en la{' '}
            <Link href="/privacy">Política de privacidad</Link>. Puedes solicitar la eliminación de
            tu cuenta desde Perfil o mediante <Link href="/support">Soporte</Link>. Al eliminarla,
            anonimizamos los datos personales y conservamos únicamente los registros mínimos que
            resulten necesarios y estén permitidos por la ley para integridad del historial,
            seguridad, prevención de abuso y atención de controversias.
          </p>
        </section>

        <section className="legalSection" id="changes">
          <h2>15. Cambios a estos términos</h2>
          <p>
            Podemos actualizar estos términos para reflejar cambios legales, técnicos o del
            Servicio. Publicaremos la nueva versión con su fecha de vigencia y, si el cambio es
            material, informaremos por un medio razonable antes de que aplique y solicitaremos una
            nueva aceptación cuando sea necesario. Los cambios no serán retroactivos ni reducirán
            derechos adquiridos.
          </p>
        </section>

        <section className="legalSection" id="law">
          <h2>16. Ley aplicable y controversias</h2>
          <p>
            Estos términos se rigen por las leyes de la República de Colombia. Antes de iniciar una
            reclamación, puedes contactarnos para buscar una solución directa. Si no se resuelve, la
            controversia podrá presentarse ante la autoridad administrativa o judicial competente de
            acuerdo con la ley. No imponemos arbitraje obligatorio, renuncias a acciones colectivas
            ni un domicilio que desconozca el fuero legal del consumidor.
          </p>
        </section>

        <section className="legalSection" id="contact">
          <h2>17. Contacto del proyecto</h2>
          <p>
            Happy Circles es un proyecto tecnológico independiente desarrollado por un equipo de
            tres personas. Para soporte, peticiones, quejas, reclamos o preguntas sobre estos
            términos, escribe a{' '}
            <a href="mailto:soporte@happy-circles.com">soporte@happy-circles.com</a> o visita{' '}
            <Link href="/support">Soporte</Link>.
          </p>
        </section>
      </article>
    </main>
  );
}
