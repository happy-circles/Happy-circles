import {
  createServiceRoleClient,
  createSha256Hex,
  handlePublicRpc,
  requireString,
} from '../_shared/http.ts';
import {
  readSocialRegistrationAudiences,
  verifySocialRegistrationCredential,
} from '../_shared/social-registration-proof.ts';

const configuration = {
  googleAudiences: readSocialRegistrationAudiences(
    Deno.env.get('SOCIAL_REGISTRATION_GOOGLE_AUDIENCES'),
  ),
  appleAudiences: readSocialRegistrationAudiences(
    Deno.env.get('SOCIAL_REGISTRATION_APPLE_AUDIENCES'),
  ),
};

Deno.serve((request) =>
  handlePublicRpc(
    request,
    async (body) => {
      const identity = await verifySocialRegistrationCredential(
        {
          provider: body.provider,
          idToken: body.idToken,
          nonce: body.nonce,
        },
        configuration,
      );
      const client = createServiceRoleClient();
      const { data, error } = await client.rpc('prepare_social_registration', {
        p_delivery_token: requireString(body.deliveryToken, 'deliveryToken'),
        p_provider: identity.provider,
        p_provider_subject: identity.subject,
        p_email: identity.email,
        p_credential_expires_at: identity.expiresAt,
      });
      // All invite lookup/ownership failures have one public outcome, without email/account enumeration.
      if (error) throw new Error('Invalid social registration proof');
      return data;
    },
    {
      maxBodyBytes: 40 * 1024,
      rateLimit: [
        {
          actorRequired: false,
          limit: 10,
          scope: 'prepare-social-registration:minute',
          windowSeconds: 60,
        },
        {
          actorRequired: false,
          limit: 40,
          scope: 'prepare-social-registration:hour',
          windowSeconds: 3600,
        },
        {
          actorRequired: false,
          limit: 10,
          scope: async ({ body }) =>
            `prepare-social-registration:invite:${await createSha256Hex(
              typeof body.deliveryToken === 'string' ? body.deliveryToken.trim() : 'invalid-token',
            )}`,
          windowSeconds: 300,
        },
      ],
    },
  ),
);
