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

Declarar como datos recolectados/procesados:

- Email.
- Nombre visible.
- Telefono.
- Contactos opcionales usados para invitaciones.
- Foto/avatar opcional.
- Identificadores de sesion y dispositivo confiable.
- Analitica propia de producto.
- Datos financieros entre usuarios: solicitudes, saldos, ledger, auditoria y cierres.

Declarar:

- No venta de datos.
- No tracking publicitario.
- Datos usados para funcionalidad, seguridad, auditoria y soporte.
- Eliminacion de cuenta disponible dentro de la app con retencion minima del ledger.

## DNS y App Links

Estado actual:

- `https://app.happy-circles.com/privacy`, `/terms` y `/support` responden 200.
- `assetlinks.json` ya incluye fingerprint Android del certificado de upload EAS.
- SHA256 Android actual: `CE:9F:B0:28:2F:5C:7D:0A:DC:A9:37:34:92:86:1F:59:4B:2B:82:84:EB:5A:5C:DA:0E:40:03:54:B5:94:05:EB`.
- `apple-app-site-association` sigue con `details: []` hasta configurar `APPLE_TEAM_ID` o `APPLE_APP_ID`.

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

## Bloqueos de release

- Revision/aprobacion legal de privacidad y terminos.
- DNS opcional de `www.happy-circles.com` si se quiere separar marketing del dominio operativo.
- Apple App ID/Team ID en Vercel.
- Store URLs reales en Vercel.
- Credenciales Apple/Google para submit automatico.
- QA en dispositivos fisicos iOS y Android.
