import { randomInt } from 'node:crypto';
import { AppError } from '../../../shared/http/errors.ts';

const reserved = new Set(['api','app','admin','login','logout','register','pricing','create','manage','privacy','terms','assets','storage','health','favicon.ico','robots.txt','sitemap.xml']);
const format = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugSuggestion = Readonly<{
  suggestion: string;
  alternatives: readonly string[];
  exposesMobilePhone: true;
  privacyWarning: string;
}>;

export class CustomSlugService {
  normalize(value: string): string {
    const slug = value.trim().toLowerCase();
    if (slug.length < 3 || slug.length > 100 || !format.test(slug) || reserved.has(slug)) {
      throw new AppError(422, 'SLUG_INVALID', 'The custom URL is invalid or reserved.');
    }
    return slug;
  }

  isReserved(value: string): boolean { return reserved.has(value.trim().toLowerCase()); }

  suggest(fullName: string, mobilePhone: string): SlugSuggestion {
    const firstName = fullName.trim().split(/\s+/u)[0] ?? '';
    const letters = firstName.normalize('NFKD').replace(/[^a-zA-Z]/g, '').toLowerCase();
    const prefix = (letters.slice(0, 2) + this.#letters(2)).slice(0, 2);
    const digits = mobilePhone.replace(/\D/g, '');
    const phoneSuffix = digits || String(randomInt(1000, 10000));
    const suggestion = this.normalize(`${prefix}${phoneSuffix}`);
    return {
      suggestion,
      alternatives: [`${prefix}-${this.#word(6)}`, `${letters.slice(0, 20) || prefix}-${this.#word(4)}`],
      exposesMobilePhone: true,
      privacyWarning: 'This suggestion exposes the mobile phone number in the public URL.',
    };
  }

  alternatives(base: string): readonly string[] {
    const normalized = base.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'card';
    return [1, 2, 3].map((offset) => `${normalized}-${randomInt(10 + offset * 10, 20 + offset * 10)}`);
  }

  #letters(length: number): string { let value = ''; for (let index = 0; index < length; index += 1) value += String.fromCharCode(97 + randomInt(26)); return value; }
  #word(length: number): string { return this.#letters(length); }
}
