export function isProjectApiKeyBearer(
  accessToken: string,
  requestApiKey: string | null,
  configuredAnonKey: string,
): boolean {
  const apiKey = requestApiKey?.trim() ?? '';
  return (
    (configuredAnonKey.length > 0 && accessToken === configuredAnonKey) ||
    (apiKey.length > 0 && accessToken === apiKey)
  );
}
