import type { Request } from 'express';

export function readCookie(request: Request, name: string): string | null {
  for (const pair of (request.header('cookie') ?? '').split(';')) {
    const index = pair.indexOf('=');
    if (index < 0 || pair.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(pair.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}
