# Contributing

## Contributor License Agreement (CLA)

**Before we merge a non-trivial contribution from someone who is not already covered by a corporate agreement**, that person must agree to the [**Contributor License Agreement**](./CLA.md) (individual).

Typical ways this is handled:

- **[cla-bot](https://github.com/apps/cla-bot)** (recommended): the organization keeps a single config in **[`vex-protocol/clabot-config`](https://github.com/vex-protocol/clabot-config)** (`.clabot` at the repo root). cla-bot resolves that automatically for org repos when the app can read **`clabot-config`**. The `contributors` list there is the source of truth (maintainers may also update **[vex.wtf](https://vex.wtf) → Admin → CLA** when automation is enabled). When a PR needs a CLA, **cla-bot** comments with links to [CLA.md](./CLA.md) and **[vex.wtf/cla](https://vex.wtf/cla)**. Re-check with **`@cla-bot check`** on the PR.
- **GitHub CLA Assistant** (or similar): alternative if you prefer that flow.
- **Manual**: maintainers record that the contributor commented on the PR (e.g. “I agree to the CLA”) or returned a signed copy, consistent with your counsel’s guidance.

**Before the first external PR:** add maintainer GitHub usernames to **`clabot-config`** `.clabot` → `contributors` so your own PRs pass the check. Optionally make the **`cla-bot`** / **`verification/cla-signed`** status a required check in branch protection.

Trivial changes (e.g. typo fixes) are often handled under the same policy your lawyers prefer—align this section with them.

## Licensing overview

See [**LICENSING.md**](./LICENSING.md) for the default **AGPL** terms and **commercial licensing** contact information.

## Copyright headers

New source files under `src/` should include the standard header (see any existing `.ts` file).

- **Check (also runs in CI):** `npm run copyright:check`
- **Apply missing headers:** `npm run copyright:apply`

From the **vex-protocol** monorepo root: `node scripts/add-copyright-headers.mjs` or `… --check`.

## Development

See the [README](./README.md) (build, test, lint) and [AGENTS.md](./AGENTS.md) (releases and changesets).
