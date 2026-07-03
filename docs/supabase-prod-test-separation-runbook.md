# Supabase production/test separation runbook

Ultima revision: 2026-07-03.

Este runbook mantiene un backend de produccion limpio para tiendas y un backend
test/demo separado para QA, datos sembrados, APKs e internal builds.

## Estado objetivo

- Produccion: backend limpio, usado por App Store/TestFlight production, Play
  internal/production y App Review.
- Test/demo: backend separado, usado por QA, demos, screenshots, APKs,
  development builds y datos sembrados.
- Produccion conserva `auth.users`, `auth.identities`, `user_profiles`,
  `app_settings`, `analytics_event_catalog` y storage buckets.
- Produccion borra estado de producto, sesiones, refresh tokens, push devices,
  trusted devices, analytics events/facts, rate limits, support reports,
  invites, balances, ledgers, settlements, notification views, storage objects,
  audit events e idempotency keys cuando se ejecuta un clean start.

## Mapa de entornos

| Entorno    | Supabase project          | Project ref            | Uso                                                      |
| ---------- | ------------------------- | ---------------------- | -------------------------------------------------------- |
| Production | Current App Store backend | `vknfhyfdtlvvfzptpqpj` | Usuarios reales, App Review, builds de tienda            |
| Test/demo  | `happy-circles-test-demo` | `ciozrkhwekzbhsvgfqdg` | QA, demo data, internal builds, APKs, development builds |

URL test/demo:

```text
https://ciozrkhwekzbhsvgfqdg.supabase.co
```

## Reglas operativas

- Nunca sembrar demo data en produccion.
- Nunca apuntar perfiles EAS `development`, `preview` o `apk` a produccion.
- Nunca correr limpieza destructiva en produccion sin backup y test/demo
  verificado.
- Usar produccion solo para builds de tienda, TestFlight production y App
  Review.
- Usar test/demo para screenshots, QA, pruebas manuales, ensayos de review,
  demos y datos sembrados.
- Si produccion necesita otro clean start, correr
  `supabase/manual/07_production_clean_start.sql` solo despues de actualizar el
  conteo esperado de usuarios preservados y confirmar backup/test-demo.
- Si test/demo necesita datos frescos, clonar o copiar produccion hacia
  test/demo. No copiar test/demo hacia produccion salvo referencia preservada y
  revisada tabla por tabla.
- Tratar push tokens, trusted devices, sesiones, analytics, invites,
  solicitudes, ledger, settlements, storage objects y support reports como datos
  locales de cada entorno.

## Estado versionado del repo

- Migraciones versionadas hasta `0072_supabase_lint_warning_cleanup.sql`, mas
  migraciones timestamped `0062`, `0063` y `0064`.
- SQL tests versionados hasta
  `supabase/tests/22_happy_circle_edge_reservations.sql`.
- `supabase/manual/07_production_clean_start.sql` preserva usuarios/perfiles y
  limpia tablas de producto, incluida `settlement_edge_reservations`.
- `apps/mobile/eas.json` enruta `development`, `preview` y `apk` al EAS
  environment `preview`; `production` usa EAS environment `production`.
- `.env.example` contiene variables de mobile, landing, email, worker y scripts
  operacionales.

## Notas de ejecucion historicas

- Production project ref: `vknfhyfdtlvvfzptpqpj`.
- Test/demo project: `happy-circles-test-demo`.
- Test/demo project ref: `ciozrkhwekzbhsvgfqdg`.
- Test/demo URL: `https://ciozrkhwekzbhsvgfqdg.supabase.co`.
- Supabase Branching no estaba disponible en el plan usado, asi que test/demo
  se creo como proyecto separado y se poblo desde produccion.
- El restore point API no estuvo disponible durante la ejecucion original; se
  copiaron schema, data, storage metadata/files, Edge Functions, secrets y Auth
  provider settings usando Management, Storage y CLI APIs disponibles.
- Auth sessions y refresh tokens no se copiaron a test/demo porque los JWT
  secrets de proyectos distintos no son intercambiables.
- Test/demo incluyo una compatibilidad no-op para funciones de Realtime snapshot
  porque el nuevo proyecto no exponia la misma interfaz `realtime.messages`
  durante replay de migraciones. Snapshot fetches funcionaban; revalidar antes
  de depender de broadcasts realtime en test/demo.

## Preflight

1. Verificar backup completo del proyecto production.
2. Verificar que test/demo existe y puede recibir el refresh.
3. Confirmar que el repo local esta en el commit que se quiere operar.
4. Confirmar que las migraciones esperadas llegan al estado versionado actual.
5. Copiar o validar en test/demo:
   - Auth providers y redirect URLs.
   - Edge Function secrets, incluidos graph y push worker secrets.
   - Storage buckets y politicas.
   - Email provider settings.
   - Edge Functions versionadas.
6. Verificar test/demo antes de tocar produccion:
   - `auth.users` count esperado.
   - `public.user_profiles` count esperado.
   - `storage.objects` si hay avatars/datos que deban existir.
   - Login y flujos principales contra test/demo.

## Production cleanup

1. Abrir `supabase/manual/07_production_clean_start.sql`.
2. Confirmar el conteo esperado de cuentas preservadas:
   - El script actualmente espera `23` `auth.users`.
   - Si entraron usuarios reales despues del plan, parar y re-auditar antes de
     cambiar ese numero.
3. Reemplazar:

   ```sql
   REPLACE_WITH_BACKUP_AND_TEST_CLONE_VERIFIED
   ```

   con:

   ```sql
   BACKUP_AND_TEST_CLONE_VERIFIED
   ```

4. Ejecutar el script una sola vez en Supabase SQL Editor del proyecto
   production.
   - El script usa `DELETE` guardado en vez de `TRUNCATE CASCADE` para no borrar
     tablas preservadas por cascada.
5. Confirmar la grilla final:
   - `auth.users = 23`
   - `public.user_profiles = 23`
   - `auth.sessions = 0`
   - `auth.refresh_tokens = 0`
   - `storage.objects = 0`
   - Tablas de producto en `0`, incluyendo `relationships`,
     `financial_requests`, `ledger_transactions`, `settlement_proposals`,
     `settlement_edge_reservations`, `friendship_invites`, `account_invites`,
     `product_events`, `app_sessions`, `push_devices` y `trusted_devices`.
6. Vaciar archivos fisicos del bucket `avatars` en Supabase Storage si quedan
   bytes despues de limpiar metadata.

## Build environment split

Usar conjuntos separados de variables EAS:

- `production`
  - `EXPO_PUBLIC_SUPABASE_URL`: URL Supabase production.
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key production.
  - Google OAuth client IDs de produccion si aplican.
  - `EXPO_PUBLIC_APP_WEB_ORIGIN=https://app.happy-circles.com`.
  - `EXPO_PUBLIC_AUTH_REDIRECT_MODE=universal-link`.
- `preview`
  - `EXPO_PUBLIC_SUPABASE_URL`: URL Supabase test/demo.
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key test/demo.
  - Google OAuth client IDs de test/demo si aplican.
  - `EXPO_PUBLIC_APP_WEB_ORIGIN=https://app.happy-circles.com`.
  - `EXPO_PUBLIC_AUTH_REDIRECT_MODE=universal-link` o `scheme` segun build.

Routing esperado:

| EAS profile   | EAS environment | Supabase target |
| ------------- | --------------- | --------------- |
| `development` | `preview`       | Test/demo       |
| `preview`     | `preview`       | Test/demo       |
| `apk`         | `preview`       | Test/demo       |
| `production`  | `production`    | Production      |

Antes de crear build de tienda, verificar que EAS `production` solo contiene la
URL/key de production. Antes de build demo/internal, verificar que EAS `preview`
solo contiene URL/key de test/demo.

## Refresh futuro de test/demo

Usar cuando test/demo deba refrescarse desde produccion:

1. Confirmar que produccion esta sana y debe ser la fuente.
2. Tomar o verificar backup de produccion.
3. Pausar actividad QA en test/demo.
4. Copiar schema, data, storage objects, Edge Functions, Auth provider settings,
   redirect URLs y secrets requeridos hacia test/demo.
5. No copiar `auth.sessions` ni `auth.refresh_tokens`.
6. Verificar row counts de `auth.users`, `public.user_profiles`,
   `storage.objects` y tablas principales de producto.
7. Ejecutar build preview/internal contra test/demo y smoke test de login mas
   flujos principales.

## Validacion

Checks locales despues de cambios de repo:

```powershell
pnpm security:check
pnpm test:supabase
pnpm typecheck
```

Despues de production cleanup:

- Entrar con una cuenta preservada y confirmar estado limpio/vacio.
- Entrar con cuenta de App Review y confirmar login.
- Correr un build preview/internal contra test/demo y confirmar que apunta al
  project ref `ciozrkhwekzbhsvgfqdg`.
- Confirmar que push notifications no apuntan a tokens viejos de produccion.
- Confirmar que graph-cycle, push y analytics crons existen en el proyecto que
  corresponde.

## Cuándo actualizar este runbook

Actualizar este archivo si cambia cualquiera de estos puntos:

- Nuevas tablas de producto que deban limpiarse en production clean start.
- Nuevas tablas preservadas.
- Nuevas variables EAS o `.env.example`.
- Nuevas Edge Functions o worker secrets.
- Cambios en project refs de Supabase.
- Cambios en el routing de perfiles EAS.
- Cambios en App Review, demo accounts o separacion prod/test.
