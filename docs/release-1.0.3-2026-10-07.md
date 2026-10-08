# Happy Circles 1.0.3 — ejecución de release

Fecha operativa: 2026-10-07, America/Bogota. Trabajo realizado directamente en
`main`, según autorización del titular del proyecto.

## Código y validación

- `d17c654d74ab3835256bebc49a14d5f929a57a65`: release 1.0.3, cambios locales
  acumulados, descubrimiento de contactos, seguridad de dispositivos y OTA.
- `3a6b8d15a54e7a59897114055e591322d2ed8c32`: tipo explícito del entorno Expo
  para que el checkout limpio de Linux pase lint. Es la fuente exacta de los
  dos binarios de tienda y del despliegue de Supabase.
- [Security CI 37717727174](https://github.com/happy-circles/Happy-circles/actions/runs/37717727174):
  exitoso para esa fuente, incluida la suite SQL en Supabase efímero.
- [Security CI 37719533573](https://github.com/happy-circles/Happy-circles/actions/runs/37719533573):
  exitoso para `b888136e`, incluida Supabase, después de actualizar privacidad
  web y documentar la fase 1 del backend.
- Validación local: 675 pruebas en 116 archivos, lint y typecheck; 11 regresiones
  de seguridad de dependencias y siete pruebas de configuración EAS. Auditoría
  de dependencias, seguridad y build de la landing exitosos.
- Actualizaciones y parches de dependencias documentados en
  `docs/dependency-security-2026-09.md`; los parches se verifican por hash y
  pruebas de explotación. No se omiten las nuevas vulnerabilidades.

## Producción web y backend

- [Landing](https://app.happy-circles.com): despliegue automático desde `main`.
  `/`, `/reset-password`, `/setup-account` y archivos de asociación nativa
  devuelven 200; las rutas legales en español redirigen a sus páginas vigentes.
- Política de privacidad actualizada desde `b888136eff4e97582a3137f2be9f84df8ffbe5db`:
  [Vercel Production](https://vercel.com/happycirclespds-7385s-projects/happy-circles-landing/7p7fUpZYNm3M3RqHNuUckeXYH76o)
  exitoso; `/privacy` devuelve 200 y muestra fecha 2026-10-07, descubrimiento
  opcional de contactos, envío a Supabase y retención temporal de HMAC vinculados.
- `/ios` dirige a la app pública de Apple. `/android` conserva la entrada a beta
  porque Google aún no habilita producción pública.
- Supabase producción `vknfhyfdtlvvfzptpqpj`: 88 migraciones, ninguna pendiente;
  34 funciones compatibles actualizadas y 42/42 funciones ACTIVE.
- Ocho bundles financieros/eliminación permanecen en su versión anterior para
  mantener la compatibilidad con 1.0.2. Su activación requiere resolver la
  transición de clientes antiguos y completar QA de autenticación.
- [Recibos y condiciones de fase 2](supabase-release-2026-10-07.md).

## Binarios EAS

Ambos usan `production`, runtime `hc-sdk54-20260928-1`, package/bundle
`com.happycircles.app` y la fuente `3a6b8d15` indicada arriba.

| Plataforma | Versión | Build | Estado |
| --- | --- | --- | --- |
| Android | 1.0.3 (23) | [e6285ee2-6d8d-4fdb-a2ba-492782df8dbe](https://expo.dev/accounts/happy-circles/projects/happy-circles/builds/e6285ee2-6d8d-4fdb-a2ba-492782df8dbe) | FINISHED |
| iOS | 1.0.3 (38) | [451c59da-9d63-40da-a112-43d866dad7a5](https://expo.dev/accounts/happy-circles/projects/happy-circles/builds/451c59da-9d63-40da-a112-43d866dad7a5) | FINISHED |

IPA iOS descargado y verificado: versión, bundle ID, OTA habilitado, canal,
runtime y URL de updates correctos. SHA256:
`cc6f5da232fd91f56c5ac43475456b33f5dc8e312b16c861a3156a236d2031fb`.
Android AAB descargado y verificado con bundletool: versión, package, target SDK
36, OTA habilitado, canal, runtime y URL correctos; READ_CONTACTS presente,
AD_ID, RECORD_AUDIO y WRITE_CONTACTS ausentes. SHA256:
`1edff6e0571a9416ae3cfb29bedfafe5122358313a9a7bc035a13da7c0ac0cac`.
Artefactos locales en `.tmp/release-1.0.3/`, fuera del versionado Git.

Los binarios publicados 1.0.2 no incorporan expo-updates: necesitan instalar
1.0.3 antes de recibir futuras OTA. Las ramas/canales EAS `production` y
`production-smoke` ya existen; no se publicó una OTA adicional para esta release.

## Google Play

- Cuenta y app existentes; Android Publisher API y credencial de submissions
  verificadas. La clave privada se conserva fuera del repositorio.
- Auto-submission `9075b67d-c4ce-458c-8cf8-c2d233d2d8fa`: FINISHED;
  Android 1.0.3 (23) cargado inicialmente al track existente `alpha` como draft.
- Release `alpha` 1.0.3 (23) activada: PUT, validate y commit respondieron 200;
  edit `00286154186602203774`, confirmado 2026-10-07 21:51:06 America/Bogota.
  El commit usó `changesNotSentForReview=false` para enviar los cambios a revisión.
- Lectura posterior confirma `alpha` con solo 23 `completed`. Google permite
  una sola release completed activa por track; 22 conserva su binario e
  historial, aunque ya no es la release activa. Se descartó el edit de lectura.
- Testers/cohortes y otros tracks comparados antes/después sin cambios.
- `completed` en la API identifica la configuración del rollout; no demuestra
  aprobación de la revisión ni disponibilidad pública de la candidata.
- Play Console confirma `Prueba cerrada - Alpha`, `1.0.3`, `Iniciar lanzamiento
  completo` en "Cambios en la etapa de revisión". Las verificaciones rápidas
  terminaron y el panel confirma: "Tus cambios están en proceso de revisión".
  La publicación administrada ya estaba desactivada; no se alteró ese ajuste.
- Panel Play verificado: 12 testers participan durante nueve días consecutivos;
  Google requiere 14 días antes de solicitar acceso a producción. El botón de
  solicitud está deshabilitado. Actualizar alpha no equivale a publicar en el
  track público `production`.
- Data Safety actual cubre contactos: recopilados, no compartidos, no efímeros,
  opcionales y para funcionalidad. Teléfono: igual, con administración de cuenta.
  Correo: recopilado, no compartido, no efímero, requerido, funcionalidad y
  administración de cuenta. Se comprobaron respuestas sin modificarlas.
- Notas de versión `es-419` registradas en la release: "Mejoramos el envío,
  aceptación y cancelación de invitaciones entre personas. Los contactos se
  actualizan con mayor claridad y la recuperación de acceso es más estable."

## Apple

- Apple Developer confirma el acuerdo `XG8DNV4HYY`, emitido el 2026-08-18,
  aceptado el 2026-10-07 en el equipo `AA75LHJ4LC`. El titular autorizó su
  aceptación y recuperó la sesión de Apple.
- El titular autorizó también las condiciones de uso interno de App Store
  Connect API. La solicitud se envió y el panel confirmó el acceso habilitado.
- La clave existente de Expo `2H598AX2VF` figura ACTIVE, rol App Manager,
  issuer `018298b1-2b50-45eb-8d4e-ecea59a56067`, coincidente con EAS y la cuenta.
  No se generó ni revocó ninguna clave Apple.
- Primer envío
  [388b59e7-c501-4a49-8dda-0c9c2685bf94](https://expo.dev/accounts/happy-circles/projects/happy-circles/submissions/388b59e7-c501-4a49-8dda-0c9c2685bf94)
  falló antes de cargar el binario: `EAS_ASC_REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`.
  Business confirmó Free Apps Agreement ACTIVE, vigente desde el 2026-10-07
  hasta el 2027-04-20. Paid Apps Agreement no se aceptó; la app es gratuita.
- Después de esa verificación, la consulta de apps de EAS respondió 200.
  Reintento controlado
  [e43213df-9de5-4c09-9ce4-59874e384836](https://expo.dev/accounts/happy-circles/projects/happy-circles/submissions/e43213df-9de5-4c09-9ce4-59874e384836)
  FINISHED el 2026-10-07 22:43:15 America/Bogota, worker sin errores. Usó la
  misma clave y exactamente el build 1.0.3 (38); no se recompiló.
- Ficha iOS 1.0.3 creada en App Store Connect, `Prepare for Submission`.
  Novedades `es-MX` guardadas; descripción, capturas existentes y datos de
  revisión heredados. Publicación automática tras aprobación conservada.
- Apple confirma 1.0.3 (38) en Build Uploads, estado `Processing`, creada
  2026-10-07 22:43 America/Bogota. BuildUpload
  `eeb552d3-0ae6-45a5-a83a-26c4becbace8`; la carga está completada, pendiente
  de procesamiento y selección del build para enviar la ficha a revisión.
- App Privacy publicada ya incluye Contacts, Phone Number y Email Address
  para funcionalidad, vinculados a la identidad. No se alteró la declaración.
- La versión pública comprobada sigue siendo 1.0.2. Un build terminado no
  significa que 1.0.3 esté aprobada o distribuida.

## Entorno de pruebas pendiente

El proyecto configurado `ciozrkhwekzbhsvgfqdg` devuelve 403 con las credenciales
disponibles y no aparece en las cuentas consultadas. EAS `preview` carece de URL
y clave pública Supabase. Se necesita acceso al proyecto previsto o que el
titular indique otro proyecto de pruebas; no se ha sustituido por producción.
