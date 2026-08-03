import { randomInt } from 'node:crypto';

const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class StarterSlugGenerator {
  generate(): string {
    let slug = '';
    for (let index = 0; index < 7; index += 1) slug += alphabet[randomInt(0, alphabet.length)];
    return slug;
  }
}
