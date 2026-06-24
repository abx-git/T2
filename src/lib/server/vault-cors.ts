const DEFAULT_ORIGINS = ["https://abx-git.github.io", "http://localhost:3000"];

function allowedOrigins(): string[] {
  const raw = process.env.T2_VAULT_CORS_ORIGINS?.trim();
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function vaultCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowed = allowedOrigins();
  const match = origin && allowed.includes(origin) ? origin : allowed[0]!;
  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Methods": "GET, PUT, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, If-Match, Content-Type",
    "Access-Control-Expose-Headers": "ETag, Last-Modified",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function vaultOptionsResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: vaultCorsHeaders(request) });
}

export function withVaultCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(vaultCorsHeaders(request))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
