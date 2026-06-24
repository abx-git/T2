const WINDOW_MS = 60_000;
const MAX_PER_IP = 120;
const MAX_PER_KEY = 60;

interface Bucket {
  count: number;
  resetAt: number;
}

const byIp = new Map<string, Bucket>();
const byKey = new Map<string, Bucket>();

function take(map: Map<string, Bucket>, id: string, max: number): boolean {
  const now = Date.now();
  const prev = map.get(id);
  if (!prev || now >= prev.resetAt) {
    map.set(id, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (prev.count >= max) return false;
  prev.count += 1;
  return true;
}

export function clientIpFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "local";
}

export function checkVaultRateLimit(req: Request, storageKey: string): boolean {
  const ip = clientIpFromRequest(req);
  return take(byIp, ip, MAX_PER_IP) && take(byKey, storageKey, MAX_PER_KEY);
}
