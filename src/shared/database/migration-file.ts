import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const upMarker = '-- +migrate Up';
const downMarker = '-- +migrate Down';

export type MigrationFile = Readonly<{
  name: string;
  upSql: string;
  downSql: string;
  checksum: string;
}>;

export async function loadMigrationFile(path: string | URL): Promise<MigrationFile> {
  const filesystemPath = path instanceof URL
    ? fileURLToPath(path)
    : process.platform === 'win32' && /^\/[A-Za-z]:\//.test(path)
      ? path.slice(1)
      : path;
  const contents = await readFile(filesystemPath, 'utf8');
  const upPosition = contents.indexOf(upMarker);
  const downPosition = contents.indexOf(downMarker);

  if (upPosition < 0 || downPosition <= upPosition) {
    throw new Error(`Migration markers are invalid: ${basename(filesystemPath)}`);
  }

  const upStart = upPosition + upMarker.length;
  return {
    name: basename(filesystemPath),
    upSql: contents.slice(upStart, downPosition).trim(),
    downSql: contents.slice(downPosition + downMarker.length).trim(),
    checksum: createHash('sha256').update(contents).digest('hex'),
  };
}
