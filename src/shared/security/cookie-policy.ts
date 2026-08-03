import type { CookieOptions } from 'express';

export type CookiePolicyConfig = Readonly<{
  secure: boolean;
  sameSite: 'Lax' | 'Strict' | 'None';
  domain?: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
}>;

export class CookiePolicy {
  readonly #config: CookiePolicyConfig;

  constructor(config: CookiePolicyConfig) {
    if (config.sameSite === 'None' && !config.secure) throw new Error('SameSite=None requires Secure cookies.');
    this.#config = config;
  }

  access(): CookieOptions {
    return this.#options(true, this.#config.accessTtlSeconds * 1000, '/api/v1');
  }

  refresh(): CookieOptions {
    return this.#options(true, this.#config.refreshTtlDays * 86_400_000, '/api/v1/auth');
  }

  starterManage(): CookieOptions {
    return this.#options(true, this.#config.refreshTtlDays * 86_400_000, '/api/v1/starter');
  }

  csrf(): CookieOptions {
    // Frontend pages live outside /api/v1 and must be able to read only this
    // signed, non-authentication double-submit value through document.cookie.
    return this.#options(false, this.#config.refreshTtlDays * 86_400_000, '/');
  }

  clear(path: string, httpOnly = true): CookieOptions {
    return this.#options(httpOnly, undefined, path);
  }

  #options(httpOnly: boolean, maxAge: number | undefined, path: string): CookieOptions {
    return {
      httpOnly,
      secure: this.#config.secure,
      sameSite: this.#config.sameSite.toLowerCase() as 'lax' | 'strict' | 'none',
      path,
      ...(maxAge === undefined ? {} : { maxAge }),
      ...(this.#config.domain ? { domain: this.#config.domain } : {}),
    };
  }
}
