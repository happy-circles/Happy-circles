# Mapa del proyecto

Ultima revision: 2026-07-03.

Esta pagina es la capa rapida de orientacion del repo: donde vive cada cosa,
que responsabilidad tiene cada area y que documento abrir despues.

## Super resumen

Happy Circles es una app privada de finanzas entre personas de confianza. El
usuario no escribe saldos directamente: crea solicitudes, la otra persona acepta
o rechaza, y lo aceptado se convierte en entradas inmutables del ledger.

El sistema proyecta ese ledger a saldos entre pares, detecta ciclos de deuda,
propone Happy Circles y ejecuta los circulos aprobados con movimientos de ledger
generados por el sistema. La app movil es la superficie principal. Supabase
maneja auth, base de datos, RLS, storage, Edge Functions, workers, analytics y
tests SQL. La landing maneja paginas publicas, redirecciones a tiendas y
Universal/App Links.

## Empieza aqui

- `README.md`: producto, arquitectura, comandos, variables de entorno.
- `docs/project-map.md`: esta pagina; mapa corto del repo.
- `docs/adr/`: decisiones que no se deben revertir sin una nueva ADR.
- `apps/mobile/ARCHITECTURE.md`: reglas de frontera y presupuesto de archivos
  grandes en mobile.

## Donde esta el codigo

| Area                | Ruta                                                  | Responsabilidad                                                                               |
| ------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| App movil           | `apps/mobile`                                         | Expo Router, pantallas React Native, auth/session movil, live data, UI, configuracion nativa. |
| Landing             | `apps/landing`                                        | Next.js, paginas publicas, soporte/legal, redirecciones, app-link gateway, association files. |
| Paquete application | `packages/application`                                | Tipos internos de queries y DTOs de aplicacion.                                               |
| Paquete shared      | `packages/shared`                                     | Contratos Zod, enums, ids, contratos de analytics, tipos generados de base de datos.          |
| Base de datos       | `supabase/migrations`                                 | Schema, RLS, vistas, RPCs, jobs, analytics, hardening de seguridad.                           |
| Edge Functions      | `supabase/functions`                                  | Comandos autenticados, previews publicos, workers, analytics, soporte.                        |
| Tests SQL           | `supabase/tests`                                      | Ledger/cache, invitaciones, seguridad, analytics, workers, notificaciones.                    |
| Supabase local/dev  | `supabase/dev`, `supabase/scripts`, `supabase/manual` | Seeds demo, helpers de reset remoto, procedimientos manuales de prod/test.                    |
| Scripts root        | `scripts`                                             | Cron de Supabase, reportes de uso, security checks, helper de credenciales EAS push.          |
| Documentacion       | `docs`                                                | Arquitectura, operaciones, release, soporte, analytics, seguridad, ADRs.                      |

## Mapa de producto

| Feature                 | Entradas mobile                                                                                                                                         | Backend/runtime                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Auth y setup            | `apps/mobile/app/register.tsx`, `setup-account.tsx`, `reset-password.tsx`; `src/providers/session*`; `src/features/onboarding`                          | Supabase Auth, `activate-account-from-invite`, templates de email, tablas de device trust. |
| Personas e invitaciones | `app/people.tsx`, `app/person/[userId].tsx`, `app/join/*`, `app/invite/[token].tsx`; `src/features/home`, `src/features/people`, `src/features/invites` | Funciones de friendship/account invites, resolucion de contactos, previews, token hashes.  |
| Solicitudes de dinero   | `app/register.tsx`, `app/transactions.tsx`; `src/features/register`, `src/features/transactions`                                                        | `create-balance-request`, aceptar/rechazar/enmendar, RPCs de ledger.                       |
| Saldos y categorias     | `app/(tabs)/home.tsx`, `app/categories.tsx`, `app/category/[category].tsx`; `src/features/balance`, `src/features/categories`                           | Vistas de ledger, proyecciones pair-net, builders de live data.                            |
| Happy Circles           | `app/circles.tsx`, `app/settlements/[id].tsx`; `src/features/circles`, `src/features/settlements`                                                       | Propuesta/ejecucion de ciclos, graph jobs, historial de versiones.                         |
| Actividad e historial   | `app/activity.tsx`; `src/features/activity`, `src/lib/history-cases*`                                                                                   | Audit events, notification views, builders de historial.                                   |
| Perfil y seguridad      | `app/profile.tsx`; `src/features/profile`, `src/lib/device-trust.ts`                                                                                    | Trusted devices, upload/storage de avatar, borrado de cuenta, reportes de soporte.         |
| Notificaciones          | `src/lib/notifications.ts`, `src/lib/push-registration.ts`, controles de notificaciones en perfil                                                       | `register-push-token`, `send-push-notifications`, realtime snapshot notifications.         |
| Analytics               | `src/lib/analytics-client.ts`, product analytics bridge                                                                                                 | `start-app-session`, `record-product-event`, `analytics-ingest`, rollups diarios.          |

## Rutas principales

Rutas mobile en `apps/mobile/app`:

- `index.tsx`: ruteo antes de home.
- `(tabs)/home.tsx`: dashboard principal.
- `activity.tsx`, `transactions.tsx`, `categories.tsx`, `circles.tsx`,
  `people.tsx`, `profile.tsx`: pantallas principales.
- `register.tsx`: crear solicitud de dinero.
- `setup-account.tsx`, `reset-password.tsx`: flujos de identidad.
- `join/*`, `invite/[token].tsx`: invitaciones y creacion de cuenta.
- `settlements/[id].tsx`, `person/[userId].tsx`, `category/[category].tsx`:
  detalles.

Rutas landing en `apps/landing/app`:

- `page.tsx`: landing publica.
- `support`, `soporte`, `privacy`, `privacidad`, `terms`, `terminos`,
  `legal`: soporte y legales.
- `(app-links)/join`, `(app-links)/join/[token]`,
  `(app-links)/invite/[token]`, `(app-links)/reset-password`,
  `(app-links)/setup-account`: gateway web a app.
- `.well-known/apple-app-site-association`, `.well-known/assetlinks.json`:
  association files.
- `download`, `ios`, `android`: redirecciones a tienda.

## Mapa backend

- Las migraciones viven en `supabase/migrations` y actualmente llegan a
  `0072_supabase_lint_warning_cleanup.sql`, mas migraciones timestamped de
  limpieza de Supabase Advisor.
- Las Edge Functions se agrupan por proposito:
  - Solicitudes financieras: crear, aceptar, rechazar, enmendar, revertir.
  - Invitaciones y personas: friendship invites, account invites, previews,
    activacion, resolucion de contactos.
  - Settlements: proponer, aprobar, rechazar, ejecutar, graph worker.
  - Snapshots/read models: app snapshot, people overview.
  - Operacion y seguridad: analytics, support errors, account deletion,
    avatars, push registration/delivery, welcome email.
- `supabase/tests` es la suite SQL de regresion. Ejecutar `pnpm test:supabase`
  despues de cambios en schema, RLS, workers, invites, ledger, analytics o
  notificaciones.

## Mapa de documentacion

| Necesitas                        | Abre                                            |
| -------------------------------- | ----------------------------------------------- |
| Vision general tecnica/producto  | `README.md`                                     |
| Mapa corto y resumen             | `docs/project-map.md`                           |
| Auth, setup y duplicados         | `docs/authentication-roadmap.md`                |
| Email auth, templates, Resend    | `docs/auth-email-setup.md`                      |
| Universal Links y Android Links  | `docs/app-link-gateway.md`                      |
| RLS, Edge Functions, tokens      | `docs/security-architecture.md`                 |
| Auditoria de seguridad           | `docs/security-hardening-audit.md`              |
| Separacion Supabase prod/test    | `docs/supabase-prod-test-separation-runbook.md` |
| Modelo de analytics              | `docs/analytics-data-model.md`                  |
| Soporte y errores de cliente     | `docs/support-observability.md`                 |
| Cron de graph-cycle worker       | `docs/graph-cycle-worker.md`                    |
| Cron y credenciales push         | `docs/push-notification-worker.md`              |
| Historial/KPIs de Happy Circles  | `docs/happy-circles-history.md`                 |
| Tipografia mobile                | `docs/mobile-typography.md`                     |
| Checklist App Store / Play Store | `docs/store-release-readiness.md`               |
| UX y copy                        | `docs/ux-copy-standards.md`                     |
| Decisiones de arquitectura       | `docs/adr/*.md`                                 |

## Comandos para recordar

```bash
pnpm install
pnpm dev:mobile
pnpm dev:landing
pnpm test
pnpm typecheck
pnpm lint
pnpm build:landing
pnpm security:check
pnpm test:supabase
```

Comandos operacionales:

```bash
pnpm supabase:usage
pnpm supabase:cron:analytics -- --apply
pnpm supabase:cron:graph-cycle -- --apply
pnpm supabase:cron:push-notifications -- --apply
pnpm supabase:cleanup:avatars -- --apply
pnpm eas:push-credentials
```

## Orden sugerido de revision

1. Mapa: `README.md`, `docs/project-map.md`.
2. Release y entornos: `docs/store-release-readiness.md`,
   `docs/supabase-prod-test-separation-runbook.md`, `.env.example`.
3. Identidad: `docs/authentication-roadmap.md`, `docs/auth-email-setup.md`,
   `docs/app-link-gateway.md`.
4. Seguridad/backend: `docs/security-architecture.md`,
   `docs/security-hardening-audit.md`, `docs/analytics-data-model.md`,
   `docs/graph-cycle-worker.md`, `docs/push-notification-worker.md`.
5. Producto mobile: `apps/mobile/ARCHITECTURE.md`,
   `docs/mobile-typography.md`, `docs/ux-copy-standards.md`,
   `docs/happy-circles-history.md`.
