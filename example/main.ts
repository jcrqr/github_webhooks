/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { Config, generateSecret, on, webhooks } from "../mod.ts";

const config: Config = {
  appId: Deno.env.get("APP_ID"),
  secret: Deno.env.get("APP_SECRET") || generateSecret(),
  privateKey: Deno.env.get("APP_PRIVATE_KEY"),
};

console.info("Secret: ", config.secret);

webhooks(config)(
  on("issue_comment", ({ issue, comment }, _context) => {
    console.info(
      `@${comment.user.login} commented on issue #${issue.number}: ${comment.body}`,
    );
  }),
);
