# EAS Update: builds, publicación y reversión

Configuración preparada el 28 de septiembre de 2026. Este documento describe
operaciones; no afirma que se hayan generado, instalado ni publicado builds.

## Contrato de compatibilidad

El primer binario con OTA utiliza el runtime explícito
`hc-sdk54-20260928-1`, definido en `apps/mobile/update-policy.json`. Integra
`expo-updates` compatible con Expo SDK 54. Las apps instaladas antes de este
cambio necesitan **una nueva versión de Android/iOS**; no pueden recibir su
propia habilitación de OTA.

| Destino      | Perfil de build | Canal            | EAS environment | Supabase                    |
| ------------ | --------------- | ---------------- | --------------- | --------------------------- |
| Preview      | preview         | preview          | preview         | ciozrkhwekzbhsvgfqdg (test) |
| APK de smoke | apk             | production-smoke | production      | vknfhyfdtlvvfzptpqpj (prod) |
| Tiendas      | production      | production       | production      | vknfhyfdtlvvfzptpqpj (prod) |

El perfil development usa environment y canal preview. El APK de smoke puede
probar el backend real sin recibir ni distribuir OTA al canal de tiendas.

El runtime no es el número de build ni la versión visible. Cualquier cambio
nativo incompatible —SDK, módulo nativo, plugin, permisos o configuración
nativa— exige cambiar el runtime y construir binarios nuevos. Una corrección
compatible de JavaScript o assets mantiene el runtime. Antes de publicar,
comparar el cambio con el commit del build instalado y comprobar que no haya
cambios nativos sin un nuevo runtime.

Android está versionado, pero `apps/mobile/.easignore` lo excluye de los archivos
enviados a EAS. Por tanto EAS genera Android e iOS desde `app.config.ts`. El
Android local también queda configurado; su canal `local` evita conectarlo por
accidente a actualizaciones de producción. EAS Build coloca el canal del perfil
en los binarios que genera. No eliminar `.easignore` sin revisar este contrato.

Al cambiar runtime, actualizar `update-policy.json` y el recurso
`apps/mobile/android/app/src/main/res/values/strings.xml`. Ejecutar
`pnpm check:eas-update`: comprueba SDK, configuración, coherencia de Android,
canales, arranque sin red y pruebas que rechazan cruces de entornos.

## Preparar el primer build

1. Pasar Security CI en el commit que se va a distribuir. Confirmar los valores
   públicos del environment en EAS; las variables necesarias para exportar OTA
   deben ser visibles para EAS CLI (plain text o sensitive, no secret).
2. Ejecutar la comprobación contra las variables reales. Desde `apps/mobile`:

   ```sh
   pnpm dlx eas-cli@21.7.1 env:exec preview 'node ../../scripts/check-eas-update.mjs --target preview --environment preview --expected-runtime hc-sdk54-20260928-1' --non-interactive
   pnpm dlx eas-cli@21.7.1 build --profile preview --platform all
   ```

3. Instalar los builds preview en Android e iOS. iOS requiere un dispositivo
   provisionado para distribución interna. Guardar ID de build, plataforma,
   commit, runtime, canal y resultado de la matriz de pruebas de amistades.
4. Comprobar un primer arranque en modo avión con la app cerrada previamente.
   El bundle incluido debe arrancar sin contactar EAS. Las operaciones que
   necesitan Supabase seguirán necesitando red.

`expo-updates` comprueba al arrancar, con espera de red de cero milisegundos.
Descarga en segundo plano y utiliza lo descargado en un arranque siguiente. No
se llama a `reloadAsync` durante la sesión ni se fuerza un reinicio mientras
una persona envía una solicitud o registra un movimiento.

## Publicar un cambio compatible

Usar el workflow manual **EAS Mobile Update** (`eas-mobile-update.yml`).
Seleccionar destino, plataformas instaladas, runtime comprobado en esos builds
y un mensaje. El workflow:

- Requiere Security CI exitoso para el mismo SHA; los destinos de producción
  requieren `main` y todos requieren `EXPO_TOKEN`.
- Comprueba el runtime, perfil, canal y variables del environment real. Bloquea
  URL de otro Supabase y claves de servidor colocadas en variables públicas.
- Exporta el código del checkout y ejecuta `eas update` con `--environment`
  explícito y `.env` local desactivado. En SDK 54 este argumento es esencial
  para evitar incorporar variables de otro entorno.
- Guarda el resultado con los IDs publicados en un artifact del workflow.

Primero validar en preview. Para producción se exporta otra vez **el mismo
commit probado**, usando sus variables de producción. No republicar un grupo
preview a production: las URL y claves públicas están incorporadas al bundle.
El workflow no utiliza `--skip-bundler` ni `update:republish` para promociones.

Comprobar en cada plataforma:

1. Abrir el build instalado con red, dejar terminar la descarga y cerrarlo.
2. Abrirlo otra vez y demostrar que ejecuta el cambio publicado; guardar el ID
   del grupo y evidencia de la conducta modificada. Metro/Expo Go no sustituyen
   esta comprobación.
3. Enviar/cancelar una solicitud con el update pendiente: no debe reiniciarse
   la sesión ni perderse la operación.
4. Cerrar y abrir en modo avión después de haber recibido la OTA; comprobar
   también el binario recién instalado sin haber descargado updates.

Revisar el uso agregado de EAS antes de publicar. Trabajar con el plan Free
existente; este flujo no contrata planes ni extras. La cuota de OTA no debe
convertirse en dependencia para arrancar el binario instalado.

## Volver atrás

Conservar IDs de grupos publicados y el contexto de canal/runtime. Consultar
primero el grupo afectado desde `apps/mobile`:

```sh
pnpm dlx eas-cli@21.7.1 update:view ID_DEL_GRUPO --json
```

Para retirar el último grupo de su rama y runtime, volver al anterior (o al
embedded si era el primero):

```sh
pnpm dlx eas-cli@21.7.1 update:rollback ID_DEL_GRUPO_DEFECTUOSO --message "Revertir actualización" --platform all --non-interactive
```

Para volver expresamente al bundle del binario en el canal afectado:

```sh
pnpm dlx eas-cli@21.7.1 update:roll-back-to-embedded --channel preview --runtime-version hc-sdk54-20260928-1 --platform all --message "Volver al binario validado" --non-interactive
```

Sustituir canal y runtime únicamente por los del incidente. No cambiar canales
de builds ni mover bundles entre entornos para revertir. Una reversión también
necesita conexión y nuevos arranques; no expulsa instantáneamente a clientes
desconectados de la versión defectuosa. Verificar la reversión en Android e iOS.
Estos comandos no revierten datos ni migraciones de Supabase.

## Evidencia de implementación local

- `expo install expo-updates --pnpm` seleccionó `~29.0.20` para SDK 54.
- La introspección de Expo genera Android y `Expo.plist` de iOS con la URL,
  runtime, updates habilitados y espera cero previstos.
- `pnpm check:eas-update` valida configuración y casos negativos de publicación.
- La recepción real de OTA, reversión, firma, cuota y disponibilidad de los
  entornos se certifican con los builds instalados; estas comprobaciones de
  código no los sustituyen.

Referencias oficiales: [configuración](https://docs.expo.dev/eas-update/getting-started/),
[runtime](https://docs.expo.dev/eas-update/runtime-versions/),
[variables](https://docs.expo.dev/eas/environment-variables/usage/),
[reversión](https://docs.expo.dev/eas-update/rollbacks/).
