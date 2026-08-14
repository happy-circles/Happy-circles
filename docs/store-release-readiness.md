# Store Release Readiness

Ultima revision: 2026-08-11.

Objetivo: dejar Happy Circles publicable en App Store y Play Store para primera
salida en Colombia.

## Fuentes oficiales revisadas

Reglas externas que afectan este runbook:

- Apple App Privacy Details:
  `https://developer.apple.com/app-store/app-privacy-details/`
- Apple App Review Guidelines:
  `https://developer.apple.com/app-store/review/guidelines/`
- Apple account deletion requirements:
  `https://developer.apple.com/support/offering-account-deletion-in-your-app/`
- Google Play Data safety:
  `https://support.google.com/googleplay/android-developer/answer/10787469`
- Google Play account deletion:
  `https://support.google.com/googleplay/android-developer/answer/13327111`

Mantener estas respuestas actualizadas en App Store Connect y Play Console. Las
tiendas revisan los datos recolectados/procesados y los permisos visibles, no
solo la categoria legal del producto.

## Posicionamiento de producto para tiendas

Happy Circles debe presentarse como una app de organizacion privada de saldos
entre personas de confianza, similar a una herramienta de split expenses / IOU
organizer. No debe describirse como:

- Banco, billetera, procesador de pagos o pasarela.
- Producto de credito, prestamo, adelanto, factoring o financiacion.
- Asesor financiero o servicio de inversion.

Postura recomendada para review:

- La app no mueve dinero ni desembolsa fondos.
- La app no origina creditos ni cobra intereses.
- La app no consulta buros, puntajes crediticios ni historial financiero
  externo.
- La app solo ayuda a registrar solicitudes, confirmar saldos y cerrar cuentas
  privadas entre usuarios que se conocen.

Aunque no sea un producto financiero regulado, privacidad y data safety deben
declarar saldos, solicitudes y ledger como datos financieros o de actividad
economica.

## Gates automatizados

CI oficial: `.github/workflows/security-ci.yml`.

Debe pasar:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm audit --audit-level moderate`
- `pnpm build:landing`
- `pnpm security:check`
- `pnpm test:supabase`

Localmente `test:supabase` requiere Docker Desktop con Linux containers y
Supabase CLI. Si el entorno local no tiene Docker disponible, el resultado de
GitHub Actions queda como fuente oficial.

## EAS

Workflow: `.github/workflows/eas-mobile-release.yml`.

Estado versionado:

- Proyecto EAS vinculado en `apps/mobile/app.config.ts`:
  `9b63f5f3-3c81-4d3d-bc54-1a81b998d20a`.
- `apps/mobile/eas.json` usa versionado remoto y `autoIncrement` en
  `production`.
- Perfiles `development`, `preview` y `apk` usan EAS environment `preview`.
- Perfil `production` usa EAS environment `production`.
- Submit `production` apunta a iOS `ascAppId=6766675014` y Android track
  `alpha` como `draft`.
- El workflow no corre builds si falta GitHub secret `EXPO_TOKEN`.
- `--auto-submit` solo se agrega cuando la variable de GitHub
  `EAS_AUTO_SUBMIT` es exactamente `true`.

No tratar build IDs o artifact URLs antiguos como estado actual. Confirmar el
ultimo build en Expo/EAS antes de citarlo en una entrega.

Estado EAS observado el 2026-07-05:

- iOS production build `936eb1bd-a5f1-47c6-aaec-167dd3f6502a`:
  `0.1.2 (30)`, subido a App Store Connect con submission
  `4f86060c-0346-47be-9755-156a58234c48`.
- Android production build `8d476add-8025-46f1-8d7a-7f9cd5d0f19a`:
  `0.1.2 (20)`, AAB generado el 2026-07-05.
- Android submit a Play queda bloqueado hasta asignar una Google Service
  Account Key para Play Store Submissions en EAS. La key existente en EAS es de
  FCM y no esta asignada a submissions.
- Busqueda local 2026-08-10: no se encontro ningun JSON `type=service_account`
  en las ubicaciones habituales del perfil. La cuenta activa de `gcloud`
  tampoco tiene permiso IAM para listar o crear keys en `happy-cricles-auth`.
- Avance 2026-08-10: creada la service account
  `happy-circles-play-submit@happy-circles-493003.iam.gserviceaccount.com` en
  el proyecto Google Cloud sin organizacion `happy-circles-493003`; el proyecto
  con organizacion `happy-cricles-auth` bloquea la creacion de keys por policy
  `iam.disableServiceAccountKeyCreation`.
- Play Console ya muestra esa service account como `Activo` para
  `com.happycircles.app`, con permisos de app para lectura, lectura de calidad,
  lanzar a segmentos de prueba y administrar segmentos/listas de testers.
- Bloqueo restante: Google Cloud genero dos descargas de key, pero el navegador
  integrado no las expuso al filesystem. El JSON real debe instalarse en una
  ruta segura fuera del repositorio antes de subirlo a EAS.
- Cuando la key util quede cargada en EAS, revocar en Google Cloud cualquier
  key descargada que no se conserve como fuente de verdad.

Estado Play/EAS observado el 2026-08-11:

- Se subio manualmente a Play Console el AAB local
  `apps/mobile/happy-circles-1.0.1-21.aab`.
- Manifest validado con `bundletool`: package `com.happycircles.app`,
  `versionName 1.0.1`, `versionCode 21`, target SDK 36.
- El manifest no declara `com.google.android.gms.permission.AD_ID`; la
  declaracion de ID de publicidad se guardo como "No".
- La service account para submit automatico sigue pendiente porque el JSON real
  no esta disponible en filesystem. El submit Android actual fue manual en Play
  Console, no por `eas submit`.

Requisitos remotos:

- GitHub secret `EXPO_TOKEN`.
- Variable opcional `EAS_AUTO_SUBMIT=true` si se quiere auto-submit.
- Credenciales remotas iOS y Android configuradas en EAS.
- Apple App Store Connect listo para TestFlight.
- Google Play service account configurado para Play Store Submissions.
- EAS `production` con variables publicas de produccion.
- EAS `preview` con variables publicas de test/demo.

La promocion publica a produccion sigue siendo manual.

## EU Digital Services Act: Trader Status

Estado declarado en App Store Connect el 2026-07-21:

- Happy Circles esta declarado como **Non-Trader** bajo la DSA porque la app se
  distribuye actualmente como una herramienta gratuita de ayuda, sin
  monetizacion ni actividad comercial.
- Esta declaracion no es permanente. Debe reevaluarse **antes** de monetizar la
  app, firmar o activar el Paid Apps Agreement, ofrecer compras o suscripciones,
  cobrar por servicios, vender publicidad o usar la app como parte de una
  actividad comercial o profesional.
- Si cualquiera de esas condiciones cambia, actualizar App Store Connect >
  Business > Digital Services Act Compliance a **Trader** y completar la
  verificacion de direccion, telefono y correo comercial antes del siguiente
  envio a revision o distribucion en la Union Europea.

## Supabase produccion

Estado versionado del repo:

- Migraciones llegan a `0072_supabase_lint_warning_cleanup.sql`, mas
  migraciones timestamped de limpieza `0062`, `0063` y `0064`.
- Edge Functions versionadas incluyen account deletion, graph worker, push
  worker, analytics, snapshots, people overview, invites, avatar upload y
  comandos financieros.
- `supabase/config.toml` exige JWT en funciones autenticadas y deja publicas
  solo previews/workers que deben fallar cerrados con secret.
- `scripts/update-graph-cycle-cron.mjs`,
  `scripts/update-push-notification-cron.mjs` y
  `scripts/update-analytics-cron.mjs` configuran los crons remotos.

Antes de enviar a tiendas, confirmar en el proyecto Supabase remoto:

- Todas las migraciones estan aplicadas hasta el estado versionado.
- Todas las Edge Functions versionadas estan desplegadas.
- Secrets definidos:
  - `GRAPH_CYCLE_WORKER_SECRET`
  - `PUSH_NOTIFICATION_WORKER_SECRET` o fallback controlado a
    `GRAPH_CYCLE_WORKER_SECRET`
  - `RESEND_API_KEY` si welcome/auth email depende de Resend
- Cron de `process-graph-cycle-jobs` activo.
- Cron de `send-push-notifications` activo.
- Cron de analytics activo.
- SMTP de Auth configurado con dominio verificado.
- Redirect allow-list incluye `https://app.happy-circles.com/...` y, si aplica,
  `happycircles://...`.
- Produccion y test/demo siguen separados segun
  `docs/supabase-prod-test-separation-runbook.md`.

## Account Deletion

Flujo implementado en app:

- Ruta visible: Perfil -> Eliminar cuenta.
- La accion exige dispositivo confiable y step-up biometrico.
- Edge Function: `request-account-deletion`.
- RPC: `public.request_account_deletion(uuid, text)`.
- Se anonimizan `email`, `display_name`, telefono y `avatar_path`.
- Se elimina storage de avatar cuando esta disponible.
- Se revocan trusted devices.
- Se hace soft delete del usuario de Supabase Auth desde la Edge Function.
- Se conserva ledger/auditoria minima para integridad financiera, prevencion de
  abuso y soporte de disputas.

Requisitos de tienda:

- Apple: si la app permite crear cuenta, debe permitir iniciar la eliminacion
  desde la app. El flujo actual cumple esta ruta; mantenerla visible y
  funcional en review.
- Google Play: si la app permite crear cuenta, tambien debe declarar en Play
  Console una URL web para solicitar eliminacion de cuenta/datos sin abrir la
  app. Candidato actual: `https://app.happy-circles.com/support`.

Estado repo 2026-07-04: `/support` ya indica explicitamente que acepta
solicitudes web de eliminacion de cuenta y datos. Antes de completar Google
Play account deletion, desplegar el landing y verificar el contenido publicado
en `https://app.happy-circles.com/support`.

## App Store Privacy Inventory

Respuesta base para App Store Connect:

- La app recolecta datos: Si.
- Los datos se usan para tracking: No.
- La app usa publicidad de terceros o retargeting: No.
- Los datos se venden a brokers o redes publicitarias: No.
- La mayoria de datos deben marcarse como "Linked to the User", porque se
  guardan contra la cuenta autenticada, el usuario Supabase, el dispositivo
  confiable o relaciones financieras.
- Usos principales: App Functionality, Analytics y, donde aplique, Product
  Personalization.
- Privacy Policy URL: `https://app.happy-circles.com/privacy`.
- Privacy Choices URL opcional: `https://app.happy-circles.com/privacy` o
  `https://app.happy-circles.com/support`.

Categorias recomendadas en App Store Connect:

| Categoria ASC  | Tipo de dato          | Linked to user | Usos                                       | Notas                                                                        |
| -------------- | --------------------- | -------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| Contact Info   | Name                  | Yes            | App Functionality, Product Personalization | Nombre visible de perfil y personas de confianza.                            |
| Contact Info   | Email Address         | Yes            | App Functionality                          | Auth, cuenta, soporte y notificaciones transaccionales.                      |
| Contact Info   | Phone Number          | Yes            | App Functionality                          | Perfil, resolucion de contactos e invitaciones.                              |
| Contacts       | Contacts              | Yes            | App Functionality                          | Opcional; se usa para encontrar o invitar personas iniciadas por el usuario. |
| User Content   | Photos or Videos      | Yes            | App Functionality, Product Personalization | Foto/avatar opcional desde camara o libreria.                                |
| User Content   | Customer Support      | Yes            | App Functionality                          | Reportes/metadata sanitizada de soporte y errores con supportId.             |
| User Content   | Other User Content    | Yes            | App Functionality                          | Notas/descripciones libres en solicitudes financieras y auditoria visible.   |
| Financial Info | Other Financial Info  | Yes            | App Functionality, Analytics               | Solicitudes, saldos, deudas entre usuarios, ledger, cierres y auditoria.     |
| Identifiers    | User ID               | Yes            | App Functionality, Analytics               | ID de cuenta, usuario, sesion, proveedores de acceso y auditoria.            |
| Identifiers    | Device ID             | Yes            | App Functionality, Analytics               | Device trust, push device, session/device id hasheado.                       |
| Usage Data     | Product Interaction   | Yes            | Analytics, App Functionality               | Pantallas, acciones, funnels, aperturas y eventos de producto.               |
| Diagnostics    | Performance Data      | Yes            | Analytics, App Functionality               | Tiempos de inicio, cache, snapshot y screen-ready.                           |
| Diagnostics    | Other Diagnostic Data | Yes            | App Functionality                          | Errores operativos sanitizados, request/support IDs y fallas tecnicas.       |

Categorias que no deben marcarse salvo que cambie el producto:

- Payment Info: la app no procesa tarjetas, cuentas bancarias ni pagos.
- Credit Info: la app no consulta puntajes ni buro de credito.
- Location: no hay uso declarado de ubicacion.
- Browsing History / Search History: no aplica.
- Advertising Data: no hay publicidad.
- Sensitive Info por biometria: Face ID/biometria se usa localmente como
  step-up; no se envia el dato biometrico al servidor.
- Crash Data: no declarar salvo que se agregue un SDK de crash reporting que
  envie crash logs.

Texto corto para guardar junto a la ficha:

> Happy Circles collects account, contact, optional profile content, product
> usage, diagnostics and private financial-organizer data only to operate the
> app, authenticate users, protect sensitive actions, support invitations, keep
> auditability and improve reliability. The app does not sell data and does not
> use data for advertising tracking.

## Google Play Data Safety

La taxonomia de Play Console no es la misma de App Store Connect. Usar esta guia
como traduccion inicial y revisar cada pantalla del formulario:

| Categoria Play           | Tipos esperados                                   | Recolectado   | Compartido          | Usos                                  |
| ------------------------ | ------------------------------------------------- | ------------- | ------------------- | ------------------------------------- |
| Personal info            | Name, Email address, Phone number, User IDs       | Yes           | Revisar proveedores | App functionality, Account management |
| Contacts                 | Contacts                                          | Yes, opcional | Revisar proveedores | App functionality                     |
| Photos and videos        | Photos                                            | Yes, opcional | Revisar proveedores | App functionality                     |
| Financial info           | Other financial info                              | Yes           | Revisar proveedores | App functionality, Analytics          |
| App activity             | App interactions, In-app search/history no aplica | Yes           | Revisar proveedores | Analytics, App functionality          |
| App info and performance | Diagnostics/performance                           | Yes           | Revisar proveedores | Analytics, App functionality          |
| Device or other IDs      | Device or other IDs                               | Yes           | Revisar proveedores | App functionality, Analytics          |

Notas:

- Marcar "Data is encrypted in transit" si HTTPS/TLS se mantiene en todos los
  flujos.
- Declarar que el usuario puede solicitar eliminacion de datos.
- No marcar publicidad ni venta de datos.
- Revisar "shared" con la definicion de Google: proveedores de servicio pueden
  tener excepciones, pero hay que contestar con el criterio oficial de Play.
- No declarar ubicacion, pagos, credit score, browsing history ni advertising
  data salvo que el producto cambie.

## Google Play Console current status

Observado en Play Console el 2026-08-11 para `com.happycircles.app`:

- Produccion: no lanzada.
- Prueba cerrada `Alpha`: activa, version `21 (1.0.1)` en revision.
- Pais/region del track Alpha: Colombia.
- Lista de testers seleccionada: `Android_internal_testers`.
- Testers en la lista: 7.
- Enlace Android para testers:
  `https://play.google.com/store/apps/details?id=com.happycircles.app`.
- Enlace Web de opt-in:
  `https://play.google.com/apps/testing/com.happycircles.app`.
- Ficha de Play Store predeterminada completada y enviada a revision con
  nombre `Happy Circles`, descripcion corta, descripcion completa, icono,
  feature graphic y 2 screenshots de telefono.
- Declaracion de recursos generados con IA: no se etiquetaron recursos como IA.
- Declaracion de ID de publicidad: `No`.
- 13 cambios enviados a Google para revision. Play Console muestra:
  "Tus cambios estan en proceso de revision".
- Advertencia no bloqueante de la version: falta archivo de desofuscacion para
  R8/Proguard.

Requisito para pedir produccion:

- Publicar una version de prueba cerrada.
- Tener al menos 12 testers que hayan aceptado participar.
- Ejecutar la prueba cerrada con 12 testers como minimo durante al menos 14
  dias.
- Con 7 testers actuales faltan al menos 5 testers aceptados mas para cumplir
  el minimo de produccion.

Android developer verification revisado en Play Console el 2026-08-10:

- La seccion "Verificacion de desarrolladores de Android" muestra
  `com.happycircles.app` como `Registrada`.
- Play Console muestra 1 clave de firma asociada al package.
- Ultima actualizacion visible para el registro: 2026-05-21.
- La pestana "Identidad" usa los datos legales de la cuenta de desarrollador de
  Play Console; no aparecio una accion pendiente separada en esa pestana.
- El recordatorio del 2026-09-30 no bloquea actualmente a Happy Circles, pero
  conviene volver a revisarlo antes de enviar la prueba cerrada y antes del
  despliegue de produccion.

Estado EAS 2026-07-05:

- AAB vigente: build `8d476add-8025-46f1-8d7a-7f9cd5d0f19a`, version
  `0.1.2 (20)`.
- AAB descargado localmente en
  `dist/mobile-builds/happy-circles-0.1.2-android-20.aab`.
- `eas submit` no pudo enviar a Play porque `com.happycircles.app` no tiene
  Google Service Account Key configurada para Play Store Submissions.
- `apps/mobile/eas.json` ya apunta el submit Android a `alpha` con
  `releaseStatus=draft`, para dejar el AAB cargado sin publicarlo hasta revisar
  testers y notas.
- Play Console 2026-08-10: la service account
  `happy-circles-play-submit@happy-circles-493003.iam.gserviceaccount.com`
  quedo activa para la app con permisos de testing. Falta recuperar el JSON de
  la key del navegador y cargarlo en EAS; sin ese archivo no se puede completar
  `eas credentials --platform android` ni `eas submit`.
- Play Console 2026-08-11: el AAB `1.0.1 (21)` ya fue subido manualmente y
  enviado a revision en Alpha, por lo que la key de EAS ya no bloquea esta
  prueba cerrada. Sigue bloqueando futuros submits automatizados.

## DNS y App Links

Validado el 2026-07-03 desde este repo con `curl.exe --ssl-no-revoke -I`:

- `https://app.happy-circles.com/privacy`: 200, `text/html; charset=utf-8`.
- `https://app.happy-circles.com/terms`: 200, `text/html; charset=utf-8`.
- `https://app.happy-circles.com/support`: 200, `text/html; charset=utf-8`.
- `https://app.happy-circles.com/.well-known/apple-app-site-association`: 200,
  `application/json`.
- `https://app.happy-circles.com/.well-known/assetlinks.json`: 200,
  `application/json`.

Contenido validado el 2026-07-03:

- `apple-app-site-association` incluye
  `AA75LHJ4LC.com.happycircles.app`.
- `assetlinks.json` incluye package `com.happycircles.app`.
- SHA256 de la clave de carga de Android:
  `CE:9F:B0:28:2F:5C:7D:0A:DC:A9:37:34:92:86:1F:59:4B:2B:82:84:EB:5A:5C:DA:0E:40:03:54:B5:94:05:EB`.
- SHA256 de la clave de firma de Google Play (confirmado el 2026-07-21):
  `9B:01:55:F0:D7:F0:F3:54:E0:5A:D3:B8:7E:D6:5D:D4:35:AB:80:A6:6A:6D:32:3A:94:04:C4:7B:26:0B:DC:39`.
- `ANDROID_SHA256_CERT_FINGERPRINTS` debe contener ambos fingerprints,
  separados por coma, para cubrir instalaciones directas y las distribuidas
  por Google Play.

Pendiente externo:

- `www.happy-circles.com` sigue opcional hasta que se configure DNS del dominio
  de marketing.
- Vercel debe tener:
  - `APPLE_APP_ID` o `APPLE_TEAM_ID`.
  - `NEXT_PUBLIC_APP_STORE_URL`.
  - `NEXT_PUBLIC_PLAY_STORE_URL`.
- Provisionar `soporte@happy-circles.com` como buzon, alias o grupo real antes
  de publicar en tiendas.
- La asociación de Android se desplegó a producción el 2026-07-21 y el dominio
  público responde con las claves de carga y de firma de Google Play.
- Validar de nuevo antes de submit:
  - `https://app.happy-circles.com/.well-known/apple-app-site-association`
  - `https://app.happy-circles.com/.well-known/assetlinks.json`

`details: []` o `[]` significa que faltan envs o certificados.

## Review Notes

Preparar para Apple/Google:

- Credenciales demo.
- Explicacion de permisos:
  - Camara: QR y avatar.
  - Contactos: invitaciones iniciadas por el usuario.
  - Fotos: avatar opcional.
  - Notificaciones: recordatorios de pendientes.
  - Face ID/biometria: acciones sensibles.
- Explicacion de funcionalidades bloqueadas por login.
- Ruta de eliminacion de cuenta: Perfil -> Eliminar cuenta.
- URL web para solicitudes de cuenta/datos: `https://app.happy-circles.com/support`.
- URLs publicas:
  - `https://app.happy-circles.com/privacy`
  - `https://app.happy-circles.com/terms`
  - `https://app.happy-circles.com/support`

Texto listo para App Review Notes:

> Happy Circles is a private balance organizer for people who already know each
> other. It is not a bank, wallet, payment processor, credit product, loan
> product or investment service. The app does not move money, disburse funds,
> charge interest, consult credit bureaus or process payments. Users create and
> confirm private balance requests, invitations and settlement records with
> trusted contacts.
>
> Sign in is required because all product features depend on private account
> data, trusted devices, relationship permissions, RLS-protected Supabase data
> and audit history. The app supports Sign in with Apple as an equivalent login
> option.
>
> Permissions used:
>
> - Camera: scan invitation QR codes and optionally update the profile avatar.
> - Contacts: optional, user-initiated contact matching and invitations.
> - Photos: optional profile avatar upload.
> - Notifications: reminders and updates about pending requests or invitations.
> - Face ID / biometrics: local step-up protection for sensitive account or
>   financial actions.
>
> Account deletion is available in the app under Profile -> Delete account. The
> flow requires a trusted device and biometric step-up. Personal profile data is
> anonymized, trusted devices are revoked and the auth user is soft-deleted.
> Minimal ledger/audit records are retained only for financial integrity, abuse
> prevention and dispute support. Users can also request account/data deletion
> from https://app.happy-circles.com/support.
>
> Public links:
>
> - Privacy Policy: https://app.happy-circles.com/privacy
> - Terms: https://app.happy-circles.com/terms
> - Support and account/data requests: https://app.happy-circles.com/support

Antes de enviar:

- Usar la cuenta demo existente en App Store Connect > App Review Information.
  Cuentas esperadas: `apple-review@happy-circles.com`,
  `demo-ana@happy-circles.com` y `demo-bruno@happy-circles.com`. No versionar
  la contrasena en este repositorio.
- Validacion 2026-08-10: la contrasena de seed documentada no autentica contra
  Supabase produccion para esas cuentas. Antes de usarla en Google Play,
  confirmar la contrasena real de App Store Connect o resetear la cuenta demo en
  produccion.
- Si la cuenta demo requiere pasos especiales, pegarlos directamente en App
  Review Information.
- Review contact email: `soporte@happy-circles.com`.

## Bloqueos de release

- Revision/aprobacion legal de privacidad y terminos.
- Antes de monetizar o presentar el servicio como una oferta comercial, identificar
  al proveedor responsable en los terminos (nombre o razon social, NIT, direccion
  de notificacion, telefono y correo). Mientras Happy Circles siga como proyecto
  independiente gratuito, no inventar una sociedad ni datos de operador.
- Desplegar el landing actualizado para que `/support` publicado declare
  solicitudes web de eliminacion de cuenta/datos.
- DNS opcional de `www.happy-circles.com` si se quiere separar marketing del
  dominio operativo.
- Store URLs reales en Vercel.
- Credenciales Apple/Google para submit automatico.
- Validar EAS `production` y `preview` antes de cada build.
- QA en dispositivos fisicos iOS y Android.
