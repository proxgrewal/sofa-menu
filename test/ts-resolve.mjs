// Test-only ESM resolve hook: lets Node resolve extensionless relative imports
// (e.g. `import ... from "./data"`) to their `.ts` file, matching how the Next
// bundler resolves them. Keeps the app source extensionless (bundler-idiomatic)
// while allowing `node --test` to run the pure order core with no build step.
//   node --import ./test/ts-resolve.mjs --test test/smoke.test.ts
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(spec, ctx, next) {
    if (
      (spec.startsWith("./") || spec.startsWith("../")) &&
      !/\.[a-z]+$/i.test(spec) &&
      ctx.parentURL
    ) {
      const url = new URL(spec, ctx.parentURL);
      if (existsSync(fileURLToPath(url.href + ".ts"))) {
        return next(spec + ".ts", ctx);
      }
    }
    return next(spec, ctx);
  },
});
