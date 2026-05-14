# Security hardening audit

Fecha: 2026-05-14

## Riesgos cerrados

- SQL injection: las Edge Functions siguen delegando operaciones a RPCs de Postgres con parametros tipados. No se agrego SQL dinamico en handlers publicos.
- Abuso de Edge Functions: todas las funciones con `index.ts` deben estar declaradas en `supabase/config.toml`, y `security:check` falla si aparece una funcion nueva sin configuracion explicita.
- Flooding de endpoints: `_shared/http.ts` aplica rate limits centralizados antes de ejecutar handlers.
- Payload abuse: `_shared/http.ts` valida `Content-Type`, `Content-Length` y bytes reales antes de parsear JSON.
- Enumeracion de invitaciones: `get-account-invite-preview-public` ya no acepta ni devuelve existencia de email o telefono, y el endpoint aplica un allowlist explicito de campos publicos.
- Landing CSP: el landing usa CSP con nonce por request para scripts y conserva headers de aislamiento y privacidad.

## Limites aplicados

- JSON default de Edge Functions: 64KB.
- `analytics-ingest`: 128KB y maximo 20 eventos por batch desde el schema compartido.
- `process-graph-cycle-jobs`: 16KB.
- `get-app-snapshot`: 4KB.
- Avatar upload: 5MB y validacion de magic bytes en su handler dedicado.
- Reads autenticados: 120 requests por minuto por usuario y funcion.
- Mutaciones normales: 30 requests por minuto por usuario y funcion.
- Invitaciones/contactos: 10 requests por minuto y 100 por hora por usuario y funcion.
- Analytics: 120 requests por minuto por usuario y funcion.
- Support errors: 20 requests por minuto por usuario.
- Account deletion: 3 requests por hora por usuario.
- Public invite preview: 20 requests por hora por token y fingerprint, mas 120 por hora por fingerprint global.
- Worker publico de ciclos: secreto obligatorio y 30 requests por minuto por fingerprint.

## Guardrails de CI

- `pnpm security:check` valida funciones publicas permitidas, funciones declaradas en config, headers de seguridad, helper de payloads, RPC de rate limit y ausencia de flags publicos de invitacion.
- `supabase/tests/18_edge_rate_limits.sql` cubre el RPC `check_edge_rate_limit`, separacion por scope/actor/fingerprint y privacidad del preview publico.

## Riesgos residuales

- `style-src 'unsafe-inline'` se conserva temporalmente en el CSP del landing por compatibilidad con el build actual de Next/CSS. Riesgo bajo comparado con `script-src`; debe revisarse cuando se confirme que el build no necesita estilos inline.
- El rate limiting usa Postgres y fingerprints derivados de IP/User-Agent. Es suficiente para esta fase, pero no sustituye un WAF o proteccion perimetral si el trafico malicioso escala.
- Los limites son defaults iniciales. Si produccion muestra falsos positivos, se deben ajustar por migracion o configuracion posterior.
