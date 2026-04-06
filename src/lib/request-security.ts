import "server-only";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);

  if (!origin) {
    return;
  }

  const originUrl = new URL(origin);
  if (originUrl.origin !== requestUrl.origin) {
    throw new Error("Cross-origin form submission is not allowed.");
  }
}
