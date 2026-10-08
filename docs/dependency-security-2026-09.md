# Dependencias necesarias para volver a pasar la auditoría

El 28 de septiembre de 2026 la auditoría detectó 25 entradas inesperadas ya
presentes en la base anterior a EAS Update. Se actualizaron las versiones
afectadas para conservar el requisito de Security CI antes de publicar OTA.
No se desactivó la auditoría ni se ampliaron sus excepciones.

| Dependencia                    | Versión resultante          | Compatibilidad                                                                                           |
| ------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Next.js                        | 16.3.3                      | Mismo major; React/React DOM 19.2.5 sin cambios. Build de producción y tipos de landing comprobados.     |
| Vitest / sus paquetes internos | 4.1.11                      | Salto necesario por la versión corregida publicada; compatible con Node 22 de CI y Vite 6.4.3 ya fijado. |
| @humanfs/node                  | 0.16.8                      | Parche de dependencia de ESLint.                                                                         |
| @xmldom/xmldom                 | 0.8.15                      | Parche de parser usado por herramientas Expo.                                                            |
| browserslist                   | 4.28.7                      | Misma línea 4.x.                                                                                         |
| baseline-browser-mapping       | 2.11.0                      | Misma línea 2.x.                                                                                         |
| fast-uri                       | 3.1.6                       | Parche dentro de 3.1.x.                                                                                  |
| js-yaml                        | 4.3.2                       | Parche dentro de 4.3.x.                                                                                  |
| sharp                          | 0.35.4                      | Parche dentro de la línea 0.35 ya fijada por el repositorio.                                             |
| decode-uri-component           | 0.5.0 + adaptación CommonJS | Algoritmo corregido upstream; se conserva el contrato que espera query-string 7.                         |

Los overrides viven en `pnpm-workspace.yaml` y las versiones y hashes se fijan
en `pnpm-lock.yaml`. No se cambió el SDK de Expo ni React Native. La migración
Vitest mantiene los includes/excludes explícitos y el entorno Node existentes;
no requiere las opciones eliminadas de pools o cobertura descritas en su guía.
Next ya estaba en la versión 16: no correspondía ejecutar codemods de migración
de una versión mayor anterior.

## Decoder de enlaces

Expo Router 6 y React Navigation consumen `query-string@7.1.3`, que carga
`decode-uri-component` con `require()` y espera una función. El decoder 0.5.0
corregido cambió a ESM; un override sin adaptación rompe ese contrato.

`patches/decode-uri-component@0.5.0.patch` cambia exclusivamente la exportación
a CommonJS y conserva la normalización heredada de `+`. No modifica el nuevo
algoritmo lineal de decodificación. Su aplicación queda verificada por el hash
de pnpm. Retirar el parche y el override cuando Expo Router y sus dependencias
puedan consumir la versión ESM directamente.

`tests/dependency-security.test.ts` carga la dependencia real desde Expo Router
y comprueba Unicode, tokens con `+`, fragmentos y una entrada malformada de
30 KB. El caso largo se ejecuta en un subproceso con límite de tiempo para que
una regresión no cuelgue el runner.

`pnpm audit:dependencies` pasa tras estos cambios. Sus únicas dos excepciones
siguen siendo las de `image-size@1.2.1`, cubiertas por el parche de seguridad
preexistente. Las exportaciones Hermes de Android e iOS se vuelven a validar
porque cambió una dependencia usada por los enlaces móviles.

Fuentes primarias: [Next.js 16.3.3](https://github.com/vercel/next.js/releases/tag/v16.3.3),
[guía Vitest 4](https://v4.vitest.dev/guide/migration),
[aviso de Vitest](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9),
[decoder 0.5.0](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0),
[Browserslist](https://github.com/browserslist/browserslist/security/advisories/GHSA-c83g-rgw3-j3cx),
[humanfs](https://github.com/humanwhocodes/humanfs/security/advisories/GHSA-p498-v437-472g),
[xmldom](https://github.com/xmldom/xmldom/security/advisories/GHSA-6gmq-8vp8-gcm6),
[fast-uri](https://github.com/fastify/fast-uri/security/advisories/GHSA-jqff-g426-hqxp),
[js-yaml](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh),
[sharp](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c).

## Revalidación de la versión 1.0.3: 7 de octubre de 2026

La auditoría actual añadió avisos publicados después de la revisión anterior.
Se actualizaron Next.js a 16.3.8, undici a 6.28.1, fast-uri a 3.1.8,
brace-expansion a 1.1.21/2.1.7/5.0.12 según su línea, source-map-js a 1.2.2,
compression a 1.8.2, sharp a 0.35.5 y shell-quote a 1.11.0. No cambió el SDK
de Expo ni React Native.

Tres dependencias no tienen todavía una versión npm corregida. Se aplicaron
parches acotados de node-forge 1.4.0, http-cache-semantics 4.2.0 y braces 3.0.3.
La auditoría acepta únicamente los avisos correspondientes cuando coinciden
el nombre, versión, SHA256 del parche y configuración de pnpm, y pasan las
pruebas de explotación de `scripts/check-dependency-advisory-patches.test.mjs`.
Las pruebas rechazan firmas ASN.1 malformadas, reutilización insegura de caché
y árboles de patrones demasiado profundos, y conservan casos válidos.
Los parches mantienen finales de línea LF en Windows y Linux.

Retirar cada parche y su excepción específica cuando exista una versión npm
corregida compatible. Las dos excepciones anteriores de image-size se conservan.

Fuentes primarias: [Next.js 16.3.8](https://github.com/vercel/next.js/releases/tag/v16.3.8),
[shell-quote](https://github.com/advisories/GHSA-pqg4-j6r4-53mv),
[node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
[http-cache-semantics](https://github.com/advisories/GHSA-ch52-4w7c-c8xp),
[braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
