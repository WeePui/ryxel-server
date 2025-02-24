// This file is created to avoid the following error:
// Cannot find module 'xss-clean' or its corresponding type declarations.
// Add the following code to the file src/types/xss-clean.d.ts:
// This code will allow you to use the xss-clean module without any errors.
// This is because the module does not have its own type definitions.

declare module 'xss-clean' {
  import { RequestHandler } from 'express';
  const xssClean: () => RequestHandler;
  export = xssClean;
}
