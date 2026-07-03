# Store Release Readiness

Ultima revision: 2026-07-03.

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
  `internal`.
- El workflow no corre builds si falta GitHub secret `EXPO_TOKEN`.
- `--auto-submit` solo se agrega cuando la variable de GitHub
  `EAS_AUTO_SUBMIT` es exactamente `true`.

No tratar build IDs o artifact URLs antiguos como estado actual. Confirmar el
ultimo build en Expo/EAS antes de citarlo en una entrega.

Requisitos remotos:

- GitHub secret `EXPO_TOKEN`.
- Variable opcional `EAS_AUTO_SUBMIT=true` si se quiere auto-submit.
- Credenciales remotas iOS y Android configuradas en EAS.
- Apple App Store Connect listo para TestFlight.
- Google Play service account configurado para internal testing.
- EAS `production` con variables publicas de produccion.
- EAS `preview` con variables publicas de test/demo.

La promocion publica a produccion sigue siendo manual.

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

Bloqueo antes de Play si no se ha hecho: hacer que `/support` diga
explicitamente que sirve para solicitar eliminacion de cuenta y datos, no solo
soporte general.

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
- SHA256 Android actual publicado:
  `CE:9F:B0:28:2F:5C:7D:0A:DC:A9:37:34:92:86:1F:59:4B:2B:82:84:EB:5A:5C:DA:0E:40:03:54:B5:94:05:EB`.

Pendiente externo:

- `www.happy-circles.com` sigue opcional hasta que se configure DNS del dominio
  de marketing.
- Vercel debe tener:
  - `APPLE_APP_ID` o `APPLE_TEAM_ID`.
  - `NEXT_PUBLIC_APP_STORE_URL`.
  - `NEXT_PUBLIC_PLAY_STORE_URL`.
- Provisionar `soporte@happy-circles.com` como buzon, alias o grupo real antes
  de publicar en tiendas.
- Confirmar si Google Play App Signing genera un certificado distinto al upload
  key de EAS. Si es distinto, agregar el fingerprint de Play Console a
  `ANDROID_SHA256_CERT_FINGERPRINTS` en Vercel.
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
- Si la cuenta demo requiere pasos especiales, pegarlos directamente en App
  Review Information.
- Review contact email: `soporte@happy-circles.com`.

## Bloqueos de release

- Revision/aprobacion legal de privacidad y terminos.
- `/support` debe indicar explicitamente que acepta solicitudes web de
  eliminacion de cuenta/datos antes de completar Google Play account deletion.
- DNS opcional de `www.happy-circles.com` si se quiere separar marketing del
  dominio operativo.
- Store URLs reales en Vercel.
- Credenciales Apple/Google para submit automatico.
- Validar EAS `production` y `preview` antes de cada build.
- QA en dispositivos fisicos iOS y Android.
