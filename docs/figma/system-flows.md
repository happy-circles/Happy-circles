# System Flows

Estas secuencias no viven en Figma. Son la capa tecnica que sostiene las pantallas del archivo `APP-HOUSE`.

## Auth y route gating

```mermaid
flowchart TD
    A["Usuario sin sesion"] --> B{"Entrada"}
    B -->|"Ingresar"| C["Validar schema y signInWithPassword"]
    B -->|"Crear cuenta"| D["Validar schema y signUp"]
    B -->|"Google / Apple"| E["OAuth sign-in"]
    B -->|"Recuperar clave"| F["resetPasswordForEmail"]
    F --> G["Correo con redirect /reset-password"]
    G --> H["updateUser password"]
    C --> I["Sesion iniciada"]
    D --> J{"Hay session inmediata?"}
    J -->|"Si"| I
    J -->|"No"| K["Esperar confirmacion de correo"]
    E --> I
    H --> I
    I --> L{"app/_layout"}
    K --> L
    L -->|"signed_out"| M["/sign-in"]
    L -->|"setup incompleto"| N["/setup-account?step=..."]
    L -->|"pending invite intent"| O["/invite/{token}"]
    L -->|"perfil completo"| P["/home"]
```

Hechos del codigo:

- `signInWithPassword` valida con `emailPasswordSignInSchema` y usa `supabase.auth.signInWithPassword`.
- `registerAccount` valida con `registrationSchema` y usa `supabase.auth.signUp` con redirect a `/setup-account?step=profile`.
- `requestPasswordReset` usa `supabase.auth.resetPasswordForEmail` con redirect a `/reset-password`.
- `updatePassword` requiere una recovery session valida y usa `supabase.auth.updateUser`.
- [app/_layout.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/app/_layout.tsx) fuerza el gate de signed out, setup incompleto y pending invite intent.

Errores y bloqueos visibles:

- correo o clave invalidos
- enlace de recuperacion vencido
- SMTP / rate limit de Supabase
- recovery session faltante

## Onboarding y setup account

```mermaid
flowchart TD
    A["Entrar a /setup-account"] --> B["resolveSetupStep"]
    B --> C{"Paso actual"}
    C -->|"profile"| D["Validacion local nombre + celular"]
    D --> E{"Cambio sensible de celular?"}
    E -->|"Si"| F["Exigir dispositivo confiable + stepUpAuth"]
    E -->|"No"| G["Actualizar user_profiles"]
    F --> G
    G --> H["Mirroring auth.updateUser(data)"]
    H --> I["refreshAccountState"]
    I --> J{"Foto obligatoria?"}
    J -->|"Si"| K["Ir a paso photo"]
    J -->|"No, pero seguridad pendiente"| L["Ir a paso security"]
    J -->|"No"| M["finishSetup -> pending invite o home"]
    C -->|"photo"| N["Pedir permiso camara o galeria"]
    N --> O["Subir archivo a Storage"]
    O --> P["Actualizar user_profiles.avatar_path"]
    P --> Q["refreshAccountState + invalidate snapshot"]
    Q --> R{"Seguridad pendiente?"}
    R -->|"Si"| L
    R -->|"No"| M
    C -->|"security"| S["Confiar dispositivo"]
    S --> T["toggle biometria"]
    T --> U["pedir permisos contactos/notificaciones"]
    U --> M
```

Hechos del codigo:

- `resolveSetupStep` decide entre `profile`, `photo` y `security` usando pasos pendientes y seguridad pendiente.
- `completeProfile` escribe en `user_profiles` y luego hace mirror a `supabase.auth.updateUser({ data })`.
- `useUpdateProfileAvatarMutation` sube imagen al bucket de avatar y persiste `avatar_path`.
- `finishSetup` redirige a un pending invite si existe; si no, manda a `/home`.
- `requestContactsPermission` y `requestNotificationsPermission` actualizan estado local de permisos.

Errores y bloqueos visibles:

- nombre o celular invalidos
- cambio de celular sin dispositivo confiable
- fallo de camara o galeria
- fallo al subir avatar
- permisos denegados

## Invite remoto y claim/review

```mermaid
flowchart TD
    A["Invite / Start / Send"] --> B["Elegir contacto o alias"]
    B --> C["create-external-friendship-invite"]
    C --> D["deliveryToken + inviteLink + expiresAt"]
    D --> E["Compartir link, copiar o mostrar QR"]
    F["Abrir /invite/{token}"] --> G{"Sesion y perfil listos?"}
    G -->|"No session"| H["writePendingInviteIntent + /sign-in"]
    G -->|"Perfil incompleto"| I["writePendingInviteIntent + /setup-account"]
    G -->|"Si"| J["get-friendship-invite-preview"]
    J --> K{"preview.canClaim?"}
    K -->|"Si"| L["claim-external-friendship-invite"]
    K -->|"No"| M{"preview.canApprove?"}
    M -->|"Si"| N["review-external-friendship-invite"]
    M -->|"No"| O["Estado cerrado / vencido / invalido"]
    L --> P["clearPendingInviteIntent + refetch"]
    N --> P
```

Hechos del codigo:

- `InvitePersonScreen` usa `useCreateExternalFriendshipInviteMutation`.
- La mutacion invoca la Edge Function `create-external-friendship-invite` con `idempotencyKey`.
- `InviteLinkScreen` guarda `pendingInviteIntent` si la persona esta signed out o con setup incompleto.
- `useFriendshipInvitePreviewQuery` llama `get-friendship-invite-preview`.
- `useClaimExternalFriendshipInviteMutation` llama `claim-external-friendship-invite`.
- `useReviewExternalFriendshipInviteMutation` llama `review-external-friendship-invite`.

Errores y bloqueos visibles:

- contacto sin numero valido
- permiso de contactos o camara denegado
- token vencido o revocado
- invitacion ya conectada o reclamada por otra cuenta
- identidad incompleta para reclamar

## Profile y seguridad

```mermaid
flowchart TD
    A["Entrar a /profile"] --> B["useAppSnapshot + useSession"]
    B --> C{"Accion"}
    C -->|"Cambiar avatar"| D["Pedir permiso media/camara"]
    D --> E["Upload avatar + update user_profiles"]
    E --> F["refreshAccountState + invalidate snapshot"]
    C -->|"Agregar clave"| G["Requiere dispositivo confiable + stepUpAuth"]
    G --> H["supabase.auth.updateUser(password)"]
    H --> I["refreshAccountState"]
    C -->|"Confiar dispositivo"| J["Revalidar con password o OAuth"]
    J --> K["update trusted_devices -> trusted"]
    K --> I
    C -->|"Revocar dispositivo"| L["stepUpAuth"]
    L --> M["update trusted_devices -> revoked"]
    M --> I
    C -->|"Biometria"| N["guardar o borrar flag local"]
    C -->|"Notificaciones"| O["pedir permiso y guardar flag local"]
    O --> P["schedule/cancel reminders"]
```

Hechos del codigo:

- `ProfileScreen` mezcla estado de `useSession` con `useAppSnapshot`.
- `attachEmailPassword` solo funciona desde dispositivo confiable y despues de `stepUpAuth`.
- `trustCurrentDevice` actualiza `trusted_devices` a `trusted`.
- `revokeTrustedDevice` actualiza `trusted_devices` a `revoked`.
- `setBiometricsEnabled` usa almacenamiento local y biometric auth del dispositivo.
- Las notificaciones activas pueden programar o cancelar recordatorios diarios.

Errores y bloqueos visibles:

- dispositivo no confiable
- biometria no disponible o no enrolada
- reautenticacion abre otra cuenta
- camara o media sin permiso

## Home data loading

```mermaid
flowchart TD
    A["Pantalla con snapshot"] --> B["useAppSnapshot"]
    B --> C{"Hay userId?"}
    C -->|"No"| D["Query deshabilitada"]
    C -->|"Si"| E["fetchLiveSnapshot"]
    E --> F["Promise.all contra tablas y vistas"]
    F --> G["buildLiveSnapshot"]
    G --> H["dashboard"]
    G --> I["people y peopleById"]
    G --> J["currentUserProfile"]
    G --> K["friendshipPendingItems e history"]
    G --> L["activitySections"]
    G --> M["pendingCount"]
    G --> N["auditEvents"]
    G --> O["settlementsById"]
    P["Mutacion exitosa"] --> Q["invalidateAppSnapshot"]
    Q --> E
```

Hechos del codigo:

- `useAppSnapshot` solo se habilita con `userId`.
- `fetchLiveSnapshot` lee en paralelo:
  - `user_profiles`
  - `v_friendship_invites_live`
  - `v_friendship_invite_deliveries_live`
  - `relationships`
  - `v_open_debts`
  - `financial_requests`
  - `v_relationship_history`
  - `v_inbox_items`
  - `settlement_proposals`
  - `settlement_proposal_participants`
  - `audit_events`
- Las mutaciones invalidan el snapshot despues de escribir.

Errores y bloqueos visibles:

- sesion expirada o JWT invalido
- falla de cualquier query agregada
- datos incompletos durante estado de hidratacion
