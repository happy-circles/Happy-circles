# Store Release Readiness

Objetivo: dejar Happy Circles publicable en App Store y Play Store para primera salida en Colombia.

## Posicionamiento de producto para tiendas

Happy Circles debe presentarse como una app de organizacion privada de saldos entre personas de
confianza, similar a una herramienta de split expenses / IOU organizer. No debe describirse como:

- banco, billetera, procesador de pagos o pasarela.
- producto de credito, prestamo, adelanto, factoring o financiacion.
- asesor financiero o servicio de inversion.

La postura recomendada para review es:

- La app no mueve dinero ni desembolsa fondos.
- La app no origina creditos ni cobra intereses.
- La app no consulta burós, puntajes crediticios ni historial financiero externo.
- La app solo ayuda a registrar solicitudes, confirmar saldos y cerrar cuentas privadas entre
  usuarios que se conocen.

Aunque no sea un producto financiero regulado, las declaraciones de privacidad deben seguir
incluyendo los saldos, solicitudes y ledger como datos financieros o de actividad economica del
usuario, porque las tiendas revisan datos recolectados/procesados, no solo la categoria legal del
producto.

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

Localmente `test:supabase` requiere Docker Desktop con Linux containers y Supabase CLI. Si el entorno local no tiene Docker disponible, el resultado de GitHub Actions queda como fuente oficial.

## EAS

Workflow: `.github/workflows/eas-mobile-release.yml`.

Estado actual:

- Proyecto EAS vinculado: `@happy-circles/happy-circles`.
- Project ID: `9b63f5f3-3c81-4d3d-bc54-1a81b998d20a`.
- Android production build generado: `9f3f5599-12dc-440e-af65-de08a8d92253`.
- Android AAB: `https://expo.dev/artifacts/eas/kExxg2bHrW9cPBwQ1LVax2.aab`.
- EAS production env contiene las variables publicas de Supabase necesarias.

Requisitos:

- GitHub secret `EXPO_TOKEN`.
  - Crear en Expo Dashboard como personal access token.
  - Guardar en GitHub Actions secrets con nombre exacto `EXPO_TOKEN`.
- Credenciales remotas de iOS y Android configuradas en EAS.
- Apple App Store Connect listo para TestFlight.
- Google Play service account configurado para internal testing.

El perfil `production` de `apps/mobile/eas.json` incrementa versionado automaticamente. El submit automatico se hace desde el workflow con `eas build --auto-submit` cuando existan credenciales de tienda. La promocion publica a produccion sigue siendo manual.

## Supabase produccion

Estado actual:

- Migraciones aplicadas hasta `0037_account_deletion_requests.sql`.
- Edge Functions desplegadas, incluida `request-account-deletion`.
- `GRAPH_CYCLE_WORKER_SECRET` definido.
- Scheduled invocation de `process-graph-cycle-jobs` activo y con ejecucion exitosa.

Antes de enviar a tiendas:

- Configurar SMTP de Auth con Resend y dominio verificado.
- Confirmar allow-list de redirects:
  - `https://app.happy-circles.com/...`
  - `happycircles://...`

## Account Deletion

Flujo implementado:

- Perfil muestra links de privacidad, terminos, soporte y eliminacion de cuenta.
- La accion exige dispositivo confiable y step-up biometrico.
- Edge Function: `request-account-deletion`.
- RPC: `public.request_account_deletion(uuid, text)`.
- Se anonimizan `email`, `display_name`, telefono y `avatar_path`.
- Se elimina storage de avatar cuando esta disponible.
- Se revocan trusted devices.
- Se hace soft delete del usuario de Supabase Auth desde la Edge Function.
- Se conserva ledger/auditoria minima para integridad financiera.

## Data Safety / App Privacy Inventory

Respuesta base para App Store Connect:

- La app recolecta datos: Si.
- Los datos se usan para tracking: No.
- La app usa publicidad de terceros o retargeting: No.
- Los datos se venden a brokers o redes publicitarias: No.
- La mayoria de datos deben marcarse como "Linked to the User", porque se guardan contra la
  cuenta autenticada, el usuario Supabase, el dispositivo confiable o relaciones financieras.
- Usos principales: App Functionality, Analytics y, donde aplique, Product Personalization.
- Privacy Policy URL: `https://app.happy-circles.com/privacy`.
- Privacy Choices URL opcional: `https://app.happy-circles.com/privacy` o
  `https://app.happy-circles.com/support`.

La siguiente tabla es una guia para llenar el formulario de privacidad de App Store Connect. En la
interfaz de Apple no se pega como tabla; se usa para saber que categorias seleccionar y con que
uso declarar cada dato.

Categorias recomendadas en App Store Connect:

| Categoria ASC | Tipo de dato | Linked to user | Usos | Notas |
| --- | --- | --- | --- | --- |
| Contact Info | Name | Yes | App Functionality, Product Personalization | Nombre visible de perfil y personas de confianza. |
| Contact Info | Email Address | Yes | App Functionality | Auth, cuenta, soporte y notificaciones transaccionales. |
| Contact Info | Phone Number | Yes | App Functionality | Perfil, resolucion de contactos e invitaciones. |
| Contacts | Contacts | Yes | App Functionality | Opcional; se usa para encontrar o invitar personas iniciadas por el usuario. |
| User Content | Photos or Videos | Yes | App Functionality, Product Personalization | Foto/avatar opcional desde camara o libreria. |
| User Content | Customer Support | Yes | App Functionality | Reportes/metadata sanitizada de soporte y errores con supportId. |
| User Content | Other User Content | Yes | App Functionality | Notas/descripciones libres en solicitudes financieras y auditoria visible. |
| Financial Info | Other Financial Info | Yes | App Functionality, Analytics | Solicitudes, saldos, deudas entre usuarios, ledger, cierres y auditoria. |
| Identifiers | User ID | Yes | App Functionality, Analytics | ID de cuenta, usuario, sesion, proveedores de acceso y auditoria. |
| Identifiers | Device ID | Yes | App Functionality, Analytics | Device trust, push device, session/device id hasheado. |
| Usage Data | Product Interaction | Yes | Analytics, App Functionality | Pantallas, acciones, funnels, aperturas y eventos de producto. |
| Diagnostics | Performance Data | Yes | Analytics, App Functionality | Tiempos de inicio, cache, snapshot y screen-ready. |
| Diagnostics | Other Diagnostic Data | Yes | App Functionality | Errores operativos sanitizados, request/support IDs y fallas tecnicas. |

Categorias que no deben marcarse salvo que cambie el producto:

- Payment Info: la app no procesa tarjetas, cuentas bancarias ni pagos.
- Credit Info: la app no consulta puntajes ni buro de credito.
- Location: no hay uso declarado de ubicacion.
- Browsing History / Search History: no aplica.
- Advertising Data: no hay publicidad.
- Sensitive Info por biometria: Face ID/biometria se usa localmente como step-up; no se envia el
  dato biometrico al servidor.
- Crash Data: no declarar salvo que se agregue un SDK de crash reporting que envie crash logs.

Texto corto para guardar junto a la ficha:

> Happy Circles collects account, contact, optional profile content, product usage, diagnostics and
> private financial-organizer data only to operate the app, authenticate users, protect sensitive
> actions, support invitations, keep auditability and improve reliability. The app does not sell data
> and does not use data for advertising tracking.

## DNS y App Links

Estado actual:

- `https://app.happy-circles.com/privacy`, `/terms` y `/support` responden 200.
- Validado el 2026-06-22:
  - `https://app.happy-circles.com/privacy`: 200, `text/html; charset=utf-8`.
  - `https://app.happy-circles.com/terms`: 200, `text/html; charset=utf-8`.
  - `https://app.happy-circles.com/support`: 200, `text/html; charset=utf-8`.
  - `https://app.happy-circles.com/.well-known/apple-app-site-association`: 200,
    `application/json`.
  - `https://app.happy-circles.com/.well-known/assetlinks.json`: 200, `application/json`.
- `assetlinks.json` ya incluye fingerprint Android del certificado de upload EAS.
- SHA256 Android actual: `CE:9F:B0:28:2F:5C:7D:0A:DC:A9:37:34:92:86:1F:59:4B:2B:82:84:EB:5A:5C:DA:0E:40:03:54:B5:94:05:EB`.
- `apple-app-site-association` ya incluye `AA75LHJ4LC.com.happycircles.app`.

Pendiente externo:

- `www.happy-circles.com` sigue opcional hasta que se configure DNS del dominio de marketing.
- Vercel debe tener:
  - `APPLE_APP_ID` o `APPLE_TEAM_ID`.
  - `NEXT_PUBLIC_APP_STORE_URL`.
  - `NEXT_PUBLIC_PLAY_STORE_URL`.
- Provisionar `soporte@happy-circles.com` como buzon, alias o grupo real antes de publicar en tiendas.
- Confirmar si Google Play App Signing genera un certificado distinto al upload key de EAS; si es distinto, reemplazar `ANDROID_SHA256_CERT_FINGERPRINTS` en Vercel por el fingerprint de Play Console.
- Validar:
  - `https://app.happy-circles.com/.well-known/apple-app-site-association`
  - `https://app.happy-circles.com/.well-known/assetlinks.json`

`details: []` o `[]` significa que faltan envs o certificados.

## Review Notes

Preparar para Apple/Google:

- Credenciales demo.
- Explicacion de permisos:
  - Camara: QR y avatar.
  - Contactos: invitaciones iniciadas por el usuario.
  - Notificaciones: recordatorios de pendientes.
  - Face ID/biometria: acciones sensibles.
- Explicacion de funcionalidades bloqueadas por login.
- Ruta de eliminacion de cuenta: Perfil -> Eliminar cuenta.
- URLs publicas:
  - `https://app.happy-circles.com/privacy`
  - `https://app.happy-circles.com/terms`
  - `https://app.happy-circles.com/support`

Texto listo para App Review Notes:

> Happy Circles is a private balance organizer for people who already know each other. It is not a
> bank, wallet, payment processor, credit product, loan product or investment service. The app does
> not move money, disburse funds, charge interest, consult credit bureaus or process payments. Users
> create and confirm private balance requests, invitations and settlement records with trusted
> contacts.
>
> Sign in is required because all product features depend on private account data, trusted devices,
> relationship permissions, RLS-protected Supabase data and audit history. The app supports Sign in
> with Apple as an equivalent login option.
>
> Permissions used:
> - Camera: scan invitation QR codes and optionally update the profile avatar.
> - Contacts: optional, user-initiated contact matching and invitations.
> - Photos: optional profile avatar upload.
> - Notifications: reminders and updates about pending requests or invitations.
> - Face ID / biometrics: local step-up protection for sensitive account or financial actions.
>
> Account deletion is available in the app under Profile -> Delete account. The flow requires a
> trusted device and biometric step-up. Personal profile data is anonymized, trusted devices are
> revoked and the auth user is soft-deleted. Minimal ledger/audit records are retained only for
> financial integrity, abuse prevention and dispute support.
>
> Public links:
> - Privacy Policy: https://app.happy-circles.com/privacy
> - Terms: https://app.happy-circles.com/terms
> - Support: https://app.happy-circles.com/support

Antes de enviar:

- Usar la cuenta demo existente en App Store Connect > App Review Information. Cuentas esperadas:
  `apple-review@happy-circles.com`, `demo-ana@happy-circles.com` y
  `demo-bruno@happy-circles.com`. No versionar la contrasena en este repositorio.
- Si la cuenta demo requiere pasos especiales, pegarlos directamente en App Review Information.
- Review contact email: `soporte@happy-circles.com`.

## Bloqueos de release

- Revision/aprobacion legal de privacidad y terminos.
- DNS opcional de `www.happy-circles.com` si se quiere separar marketing del dominio operativo.
- Apple App ID/Team ID en Vercel.
- Store URLs reales en Vercel.
- Credenciales Apple/Google para submit automatico.
- QA en dispositivos fisicos iOS y Android.
