#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_ACCOUNT_NAME = 'happy-circles';
const DEFAULT_PROJECT_FULL_NAME = '@happy-circles/happy-circles';
const DEFAULT_IOS_BUNDLE_IDENTIFIER = 'com.happycircles.app';
const DEFAULT_ANDROID_APPLICATION_IDENTIFIER = 'com.happycircles.app';

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1]?.trim() || null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readExpoSessionSecret() {
  const expoToken = process.env.EXPO_TOKEN?.trim();
  if (expoToken) {
    return { header: 'authorization', value: `Bearer ${expoToken}` };
  }

  const statePath = path.join(os.homedir(), '.expo', 'state.json');
  if (!fs.existsSync(statePath)) {
    throw new Error('Run `eas login` or set EXPO_TOKEN before using this script.');
  }

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const sessionSecret = state?.auth?.sessionSecret?.trim();
  if (!sessionSecret) {
    throw new Error('Run `eas login` or set EXPO_TOKEN before using this script.');
  }

  return { header: 'expo-session', value: sessionSecret };
}

async function graphqlRequest(query, variables) {
  const auth = readExpoSessionSecret();
  const response = await fetch('https://api.expo.dev/graphql', {
    body: JSON.stringify({ query, variables }),
    headers: {
      'content-type': 'application/json',
      [auth.header]: auth.value,
    },
    method: 'POST',
  });
  const body = await response.json();

  if (!response.ok || body.errors) {
    const message = body.errors?.map((error) => error.message).join('; ') ?? response.statusText;
    throw new Error(message || `Expo GraphQL request failed with HTTP ${response.status}`);
  }

  return body.data;
}

async function loadCredentialState() {
  const accountName = process.env.EAS_ACCOUNT_NAME ?? DEFAULT_ACCOUNT_NAME;
  const projectFullName = process.env.EAS_PROJECT_FULL_NAME ?? DEFAULT_PROJECT_FULL_NAME;
  const iosBundleIdentifier =
    process.env.IOS_BUNDLE_IDENTIFIER ?? DEFAULT_IOS_BUNDLE_IDENTIFIER;
  const androidApplicationIdentifier =
    process.env.ANDROID_APPLICATION_IDENTIFIER ?? DEFAULT_ANDROID_APPLICATION_IDENTIFIER;

  const accountData = await graphqlRequest(
    `
      query AccountByName($accountName: String!) {
        account {
          byName(accountName: $accountName) {
            id
            name
          }
        }
      }
    `,
    { accountName },
  );
  const account = accountData.account.byName;
  if (!account) {
    throw new Error(`Expo account not found: ${accountName}`);
  }

  const appData = await graphqlRequest(
    `
      query AppByFullName($projectFullName: String!) {
        app {
          byFullName(fullName: $projectFullName) {
            id
            fullName
          }
        }
      }
    `,
    { projectFullName },
  );
  const app = appData.app.byFullName;
  if (!app) {
    throw new Error(`Expo app not found: ${projectFullName}`);
  }

  const appleIdData = await graphqlRequest(
    `
      query AppleAppIdentifierByBundleId($accountName: String!, $bundleIdentifier: String!) {
        account {
          byName(accountName: $accountName) {
            appleAppIdentifiers(bundleIdentifier: $bundleIdentifier) {
              id
              bundleIdentifier
            }
          }
        }
      }
    `,
    { accountName, bundleIdentifier: iosBundleIdentifier },
  );
  const appleAppIdentifier =
    appleIdData.account.byName.appleAppIdentifiers?.[0] ?? null;

  let iosCredentials = null;
  if (appleAppIdentifier) {
    const iosData = await graphqlRequest(
      `
        query IosCredentials($projectFullName: String!, $appleAppIdentifierId: String!) {
          app {
            byFullName(fullName: $projectFullName) {
              iosAppCredentials(filter: { appleAppIdentifierId: $appleAppIdentifierId }) {
                id
                appleTeam {
                  id
                  appleTeamIdentifier
                  appleTeamName
                }
                appleAppIdentifier {
                  id
                  bundleIdentifier
                }
                pushKey {
                  id
                  keyIdentifier
                  updatedAt
                  appleTeam {
                    appleTeamIdentifier
                    appleTeamName
                  }
                }
              }
            }
          }
        }
      `,
      { projectFullName, appleAppIdentifierId: appleAppIdentifier.id },
    );
    iosCredentials = iosData.app.byFullName.iosAppCredentials?.[0] ?? null;
  }

  const androidData = await graphqlRequest(
    `
      query AndroidCredentials($projectFullName: String!, $applicationIdentifier: String) {
        app {
          byFullName(fullName: $projectFullName) {
            androidAppCredentials(filter: { applicationIdentifier: $applicationIdentifier }) {
              id
              applicationIdentifier
              googleServiceAccountKeyForFcmV1 {
                id
                projectIdentifier
                privateKeyIdentifier
                clientEmail
                updatedAt
              }
            }
          }
        }
      }
    `,
    { projectFullName, applicationIdentifier: androidApplicationIdentifier },
  );
  const androidCredentials =
    androidData.app.byFullName.androidAppCredentials?.[0] ?? null;

  return {
    account,
    androidApplicationIdentifier,
    androidCredentials,
    app,
    appleAppIdentifier,
    iosBundleIdentifier,
    iosCredentials,
  };
}

function printState(state) {
  console.log(`Expo app: ${state.app.fullName}`);
  console.log(`iOS bundle: ${state.iosBundleIdentifier}`);
  console.log(
    `iOS APNs key: ${
      state.iosCredentials?.pushKey
        ? `configured (${state.iosCredentials.pushKey.keyIdentifier})`
        : 'missing'
    }`,
  );
  console.log(`Android package: ${state.androidApplicationIdentifier}`);
  console.log(
    `Android FCM V1: ${
      state.androidCredentials?.googleServiceAccountKeyForFcmV1
        ? `configured (${state.androidCredentials.googleServiceAccountKeyForFcmV1.projectIdentifier})`
        : 'missing'
    }`,
  );
}

async function configureIosApns(state) {
  const keyPath =
    readArg('--ios-apns-key-p8') ?? process.env.IOS_APNS_KEY_P8_PATH?.trim() ?? null;
  const keyIdentifier =
    readArg('--ios-apns-key-id') ?? process.env.IOS_APNS_KEY_ID?.trim() ?? null;
  if (!keyPath && !keyIdentifier) {
    return false;
  }
  if (!state.iosCredentials) {
    throw new Error('iOS credentials do not exist in EAS for this bundle identifier.');
  }
  if (!state.iosCredentials.appleTeam?.id) {
    throw new Error('iOS credentials are missing an Apple Team in EAS.');
  }
  if (!keyPath || !keyIdentifier) {
    throw new Error('Set both --ios-apns-key-p8 and --ios-apns-key-id.');
  }
  if (!fs.existsSync(keyPath)) {
    throw new Error(`APNs .p8 file not found: ${keyPath}`);
  }

  const keyP8 = fs.readFileSync(keyPath, 'utf8');
  const pushKeyData = await graphqlRequest(
    `
      mutation CreateApplePushKey($applePushKeyInput: ApplePushKeyInput!, $accountId: ID!) {
        applePushKey {
          createApplePushKey(applePushKeyInput: $applePushKeyInput, accountId: $accountId) {
            id
            keyIdentifier
          }
        }
      }
    `,
    {
      accountId: state.account.id,
      applePushKeyInput: {
        appleTeamId: state.iosCredentials.appleTeam.id,
        keyIdentifier,
        keyP8,
      },
    },
  );
  const pushKey = pushKeyData.applePushKey.createApplePushKey;

  await graphqlRequest(
    `
      mutation SetPushKey($iosAppCredentialsId: ID!, $pushKeyId: ID!) {
        iosAppCredentials {
          setPushKey(id: $iosAppCredentialsId, pushKeyId: $pushKeyId) {
            id
            pushKey {
              id
              keyIdentifier
            }
          }
        }
      }
    `,
    { iosAppCredentialsId: state.iosCredentials.id, pushKeyId: pushKey.id },
  );

  console.log(`Configured iOS APNs key ${pushKey.keyIdentifier}.`);
  return true;
}

function readServiceAccountKey(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Google service account JSON not found: ${filePath}`);
  }

  const key = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!key.private_key || !key.client_email || !key.type) {
    throw new Error(
      'Invalid service account JSON. This is not google-services.json; it must be a private service account key.',
    );
  }

  return key;
}

async function configureAndroidFcm(state) {
  const keyPath =
    readArg('--android-service-account') ??
    process.env.ANDROID_FCM_SERVICE_ACCOUNT_KEY_PATH?.trim() ??
    null;
  if (!keyPath) {
    return false;
  }
  if (!state.androidCredentials) {
    throw new Error('Android credentials do not exist in EAS for this application identifier.');
  }

  const jsonKey = readServiceAccountKey(keyPath);
  const gsaData = await graphqlRequest(
    `
      mutation CreateGoogleServiceAccountKey(
        $googleServiceAccountKeyInput: GoogleServiceAccountKeyInput!
        $accountId: ID!
      ) {
        googleServiceAccountKey {
          createGoogleServiceAccountKey(
            googleServiceAccountKeyInput: $googleServiceAccountKeyInput
            accountId: $accountId
          ) {
            id
            projectIdentifier
            clientEmail
          }
        }
      }
    `,
    {
      accountId: state.account.id,
      googleServiceAccountKeyInput: { jsonKey },
    },
  );
  const googleServiceAccountKey = gsaData.googleServiceAccountKey.createGoogleServiceAccountKey;

  await graphqlRequest(
    `
      mutation SetGoogleServiceAccountKeyForFcmV1(
        $androidAppCredentialsId: ID!
        $googleServiceAccountKeyId: ID!
      ) {
        androidAppCredentials {
          setGoogleServiceAccountKeyForFcmV1(
            id: $androidAppCredentialsId
            googleServiceAccountKeyId: $googleServiceAccountKeyId
          ) {
            id
            googleServiceAccountKeyForFcmV1 {
              id
              projectIdentifier
            }
          }
        }
      }
    `,
    {
      androidAppCredentialsId: state.androidCredentials.id,
      googleServiceAccountKeyId: googleServiceAccountKey.id,
    },
  );

  console.log(
    `Configured Android FCM V1 service account ${googleServiceAccountKey.projectIdentifier}.`,
  );
  return true;
}

async function main() {
  const apply = hasFlag('--apply');
  const before = await loadCredentialState();
  printState(before);

  if (!apply) {
    console.log('Dry run. Pass --apply with credential file paths to upload credentials.');
    return;
  }

  const didConfigureIos = await configureIosApns(before);
  const didConfigureAndroid = await configureAndroidFcm(before);
  if (!didConfigureIos && !didConfigureAndroid) {
    throw new Error(
      'No credential files provided. Use --ios-apns-key-p8/--ios-apns-key-id and/or --android-service-account.',
    );
  }

  const after = await loadCredentialState();
  printState(after);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
