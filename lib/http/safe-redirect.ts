const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

export function resolveRootRelativeRedirect(
  requestUrl: URL,
  requestedPath: string | null | undefined
): URL {
  const fallback = new URL("/", requestUrl.origin);

  if (
    !requestedPath ||
    !requestedPath.startsWith("/") ||
    requestedPath.startsWith("//") ||
    requestedPath.includes("\\") ||
    controlCharacterPattern.test(requestedPath)
  ) {
    return fallback;
  }

  try {
    const destination = new URL(requestedPath, fallback);
    return destination.origin === fallback.origin ? destination : fallback;
  } catch {
    return fallback;
  }
}
