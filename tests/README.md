# tests/

Repository hygiene checks. Application tests live in each package
(`automation/test`, `production/test`, `marketing/test`, `seo/test`,
`services/test`, `spreadsheet/test`) and all run with `npm test` from the
repository root.

```bash
bash tests/verify-foundation.sh
```

Checks performed:

- `.env` is git-ignored.
- No `.env`, `.pem`, `.key`, or `credentials*.json` files are tracked by git.
- `.env.example` and `automation/.env.example` document the required
  variable names.
- No untracked `.env` file is sitting in the working tree unignored.

Run it before committing.
