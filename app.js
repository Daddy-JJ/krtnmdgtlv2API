'use strict';

// LiteSpeed/CloudLinux may require this default filename even when the panel
// displays a custom startup file. Keep the root package CommonJS and defer the
// ESM/TypeScript server graph across a dynamic import boundary.
void import('./src/server.ts').catch((error) => {
  console.error('Passenger application startup failed.', error);
  process.exitCode = 1;
});
