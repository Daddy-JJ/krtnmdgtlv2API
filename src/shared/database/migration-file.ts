import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const upMarker = '-- +migrate Up';
const downMarker = '-- +migrate Down';

export type MigrationFile = Readonly<{
  name: string;
  upSql: string;
  downSql: string;
  checksum: string;
}>;

export async function loadMigrationFile(path: string): Promise<MigrationFile> {
  const contents = await readFile(path, 'utf8');
  const upPosition = contents.indexOf(upMarker);
  const downPosition = contents.indexOf(downMarker);

  if (upPosition < 0 || downPosition <= upPosition) {
    throw new Error(`Migration markers are invalid: ${basename(path)}`);
  }

  const upStart = upPosition + upMarker.length;
  return {
    name: basename(path),
    upSql: contents.slice(upStart, downPosition).trim(),
    downSql: contents.slice(downPosition + downMarker.length).trim(),
    checksum: createHash('sha256').update(contents).digest('hex'),
  };
}
