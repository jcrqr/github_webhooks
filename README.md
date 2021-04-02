# GitHub Webhooks

> Handle GitHub Webhooks with Deno and Deno Deploy.

## Installation

```typescript
import { on, webhooks } from "https://deno.land/x/github_webhooks@0.1.0/mod.ts";
```

## Example

A more complete example can be found in [example/main.ts](/example/main.ts).

```typescript
// main.ts
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { on, webhooks } from "https://deno.land/x/github_webhooks@0.1.0/mod.ts";

webhooks()(
  on("issue_comment", ({ issue, comment }, _context) => {
    console.info(
      `@${comment.user.login} commented on issue #${issue.number}: ${comment.body}`,
    );
  }),
);
```

Run the example:

```bash
$ deployctl run --libs=ns,fetchevent main.ts
```

## Contributing

All contributions are very welcome!

If you find any bug or have a feature request, please [open a new issue](https://github.com/crqra/github_webhooks/issues).

For code or documentation contributions, [fork this repository](https://github.com/crqra/github_webhooks/fork),
do your thing, and submit a [Pull Request](https://github.com/crqra/github_webhooks/pulls).

## License

This project is released under the [MIT License](/LICENSE).
