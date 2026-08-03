export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buffer = '';
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index] ?? '';

    if (quote !== null) {
      buffer += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      buffer += character;
      continue;
    }

    if (character === '-' && sql[index + 1] === '-') {
      while (index < sql.length && sql[index] !== '\n') index += 1;
      buffer += '\n';
      continue;
    }

    if (character === ';') {
      const statement = buffer.trim();
      if (statement !== '') statements.push(statement);
      buffer = '';
      continue;
    }

    buffer += character;
  }

  if (quote !== null) throw new Error('Unterminated quoted value in SQL file.');
  const remainder = buffer.trim();
  if (remainder !== '') statements.push(remainder);
  return statements;
}
