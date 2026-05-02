import { createServiceRoleClient, handleRpc } from '../_shared/http.ts';

interface WelcomeEmailClaim {
  readonly email: string;
  readonly display_name: string;
}

interface AuthUserEmailState {
  readonly email_confirmed_at?: string | null;
  readonly confirmed_at?: string | null;
}

const DEFAULT_APP_ORIGIN = 'https://app.happy-circles.com';
const DEFAULT_FROM = 'Happy Circles <hola@happy-circles.com>';

function readOptionalEnv(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value && value.length > 0 ? value : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function resolveFirstName(displayName: string): string {
  const firstName = displayName.trim().split(/\s+/)[0];
  return firstName && firstName.length > 0 ? firstName : 'ahi';
}

function isEmailConfirmed(user: AuthUserEmailState | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at ?? user?.confirmed_at);
}

function buildWelcomeHtml(input: {
  readonly appOrigin: string;
  readonly displayName: string;
  readonly firstName: string;
}): string {
  const escapedDisplayName = escapeHtml(input.displayName);
  const escapedFirstName = escapeHtml(input.firstName);
  const appUrl = `${input.appOrigin.replace(/\/+$/, '')}/home`;
  const escapedAppUrl = escapeHtml(appUrl);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bienvenido a Happy Circles</title>
  </head>
  <body style="margin:0;background:#f7f8fb;color:#0f1728;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tu cuenta ya esta lista para usar Happy Circles.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:584px;background:#ffffff;border:1px solid #e6ebf3;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:34px 34px 18px;background:#ffffff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <div style="font-size:13px;letter-spacing:0;color:#667085;">Happy Circles</div>
                      <h1 style="margin:10px 0 0;font-size:30px;line-height:1.12;color:#1a2744;font-weight:700;">Tu cuenta ya esta lista</h1>
                    </td>
                    <td align="right" style="width:104px;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width:20px;height:20px;border-radius:20px;background:#3dba6e;"></td>
                          <td style="width:8px;"></td>
                          <td style="width:20px;height:20px;border-radius:20px;background:#e8604a;"></td>
                        </tr>
                        <tr>
                          <td colspan="3" style="height:8px;"></td>
                        </tr>
                        <tr>
                          <td style="width:20px;height:20px;border-radius:20px;background:#1a2744;"></td>
                          <td style="width:8px;"></td>
                          <td style="width:20px;height:20px;border-radius:20px;background:#dfe5ef;"></td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 34px 34px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.58;color:#344054;">
                  Hola ${escapedFirstName}, terminaste la configuracion principal de tu cuenta. Ya puedes conectar tus circulos, registrar movimientos y mantener los saldos claros con ${escapedDisplayName} como tu perfil.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                  <tr>
                    <td style="padding:18px;border:1px solid #e6ebf3;border-radius:18px;background:#f4f6fa;">
                      <div style="font-size:14px;line-height:1.5;color:#1a2744;font-weight:700;">Lo esencial ya quedo cubierto</div>
                      <div style="margin-top:8px;font-size:14px;line-height:1.55;color:#667085;">Correo confirmado, perfil completo y dispositivo validado para proteger tus movimientos.</div>
                    </td>
                  </tr>
                  <tr><td style="height:12px;"></td></tr>
                  <tr>
                    <td style="padding:18px;border:1px solid #e6ebf3;border-radius:18px;background:#ffffff;">
                      <div style="font-size:14px;line-height:1.5;color:#1a2744;font-weight:700;">Empieza por tus personas</div>
                      <div style="margin-top:8px;font-size:14px;line-height:1.55;color:#667085;">Agrega contactos de confianza y crea el circulo donde quieres llevar cuentas compartidas.</div>
                    </td>
                  </tr>
                  <tr><td style="height:12px;"></td></tr>
                  <tr>
                    <td style="padding:18px;border:1px solid #e6ebf3;border-radius:18px;background:#ffffff;">
                      <div style="font-size:14px;line-height:1.5;color:#1a2744;font-weight:700;">Cada movimiento queda con contexto</div>
                      <div style="margin-top:8px;font-size:14px;line-height:1.55;color:#667085;">Usa solicitudes, aprobaciones y saldos para que todos vean lo mismo sin conversaciones largas.</div>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
                  <tr>
                    <td style="background:#1a2744;border-radius:999px;">
                      <a href="${escapedAppUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Abrir Happy Circles</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:13px;line-height:1.5;color:#98a2b3;">
                  Te enviaremos correos solo cuando haya acciones importantes para tu cuenta.
                </p>
              </td>
            </tr>
          </table>
          <p style="max-width:584px;margin:18px auto 0;font-size:12px;line-height:1.5;color:#98a2b3;text-align:center;">
            Happy Circles
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildWelcomeText(input: {
  readonly appOrigin: string;
  readonly displayName: string;
  readonly firstName: string;
}): string {
  const appUrl = `${input.appOrigin.replace(/\/+$/, '')}/home`;

  return [
    `Hola ${input.firstName},`,
    '',
    'Tu cuenta de Happy Circles ya esta lista.',
    '',
    `Perfil: ${input.displayName}`,
    'Correo confirmado, perfil completo y dispositivo validado.',
    '',
    'Ya puedes conectar tus circulos, registrar movimientos y mantener los saldos claros.',
    '',
    `Abrir Happy Circles: ${appUrl}`,
  ].join('\n');
}

async function releaseClaim(
  client: ReturnType<typeof createServiceRoleClient>,
  actorUserId: string,
  reason: string,
) {
  const { error } = await client.rpc('release_welcome_email_delivery', {
    p_actor_user_id: actorUserId,
    p_error: reason,
  });

  if (error) {
    console.error('welcome_email_release_failed', { detail: error.message });
  }
}

Deno.serve((request) =>
  handleRpc(request, async (_body, actorUserId) => {
    const enabled = readOptionalEnv('WELCOME_EMAIL_ENABLED');
    if (enabled?.toLocaleLowerCase('en-US') === 'false') {
      return { sent: false, reason: 'disabled' };
    }

    const resendApiKey = readOptionalEnv('RESEND_API_KEY');
    if (!resendApiKey) {
      return { sent: false, reason: 'email_not_configured' };
    }

    const client = createServiceRoleClient();
    const { data: userResult, error: userError } = await client.auth.admin.getUserById(actorUserId);

    if (userError || !userResult.user) {
      throw new Error(userError?.message ?? 'actor_profile_not_found');
    }

    if (!isEmailConfirmed(userResult.user as AuthUserEmailState)) {
      return { sent: false, reason: 'email_not_confirmed' };
    }

    const { data: claims, error: claimError } = await client.rpc('claim_welcome_email_delivery', {
      p_actor_user_id: actorUserId,
    });

    if (claimError) {
      throw new Error(claimError.message);
    }

    const claim = Array.isArray(claims) ? (claims[0] as WelcomeEmailClaim | undefined) : undefined;
    if (!claim) {
      return { sent: false, reason: 'not_ready_or_already_sent' };
    }

    const appOrigin =
      readOptionalEnv('APP_WEB_ORIGIN') ??
      readOptionalEnv('EXPO_PUBLIC_APP_WEB_ORIGIN') ??
      DEFAULT_APP_ORIGIN;
    const from = readOptionalEnv('WELCOME_EMAIL_FROM') ?? DEFAULT_FROM;
    const replyTo = readOptionalEnv('WELCOME_EMAIL_REPLY_TO');
    const firstName = resolveFirstName(claim.display_name);
    const html = buildWelcomeHtml({
      appOrigin,
      displayName: claim.display_name,
      firstName,
    });
    const text = buildWelcomeText({
      appOrigin,
      displayName: claim.display_name,
      firstName,
    });

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [claim.email],
        subject: 'Bienvenido a Happy Circles',
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!resendResponse.ok) {
      const detail = (await resendResponse.text()).slice(0, 240);
      await releaseClaim(client, actorUserId, `resend_${resendResponse.status}: ${detail}`);
      throw new Error('welcome_email_send_failed');
    }

    const { error: markError } = await client.rpc('mark_welcome_email_sent', {
      p_actor_user_id: actorUserId,
    });

    if (markError) {
      console.error('welcome_email_mark_failed', { detail: markError.message });
      throw new Error(markError.message);
    }

    return { sent: true };
  }),
);
