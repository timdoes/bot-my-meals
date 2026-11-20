# No comments

Comments in this repo are guilty until they prove they belong. The review is the pstack `/no-comments` split: every code comment is a **tautology** or an **excuse**, unless it is a constraint about something we cannot change.

## Kill

**Tautology** — repeats what the code already shows. `count += 1` does not need `// increment the counter`. Rename, extract, or type the code until the comment is pointless, then delete the comment.

**Excuse** — lets a hack stay. `// fine for now`, `// too risky to change`, `// IMPORTANT do not remove`, `// workaround`. Fix the code. Do not narrate the workaround, and do not polish the comment into a shorter alibi.

## Keep (narrow)

These may stay, and only these:

- Legal or license headers
- Doc comments that are a public API contract
- Constraint comments about a vendor, platform, protocol, or external API we cannot reshape. Prefer encoding the constraint as a type, test, or lint rule, then delete the comment
- `prettier-ignore`
- Lint / TypeScript suppressions that name the rule **and** give a reason
- `TODO` / `FIXME` / `HACK` / `XXX` with a link to an issue or PR

`do not remove` and `talk to X before changing` are scent, not a keep, unless the nearby code proves the rule is forced by something outside this repo.

## Mechanical lint

`npm run lint` (ESLint) fails on:

| Kind | Rule |
| --- | --- |
| Commented-out code | `comments/no-commented-out-code` (local) |
| TODO/FIXME/HACK/XXX without an issue or PR link | `comments/todo-needs-link` (local; `no-warning-comments` cannot allow linked TODOs) |
| `eslint-disable` without `-- reason` | `@eslint-community/eslint-comments/require-description` |
| `@ts-expect-error` / `@ts-ignore` without a reason | `@typescript-eslint/ban-ts-comment` |
| `biome-ignore` without a reason | `comments/require-suppression-description` (local) |

New violations fail CI. Do not baseline a new comment; delete it or give it a real keep.

## Judgment

`npm run lint:comments` lists comments added in the diff vs `main` (or `COMMENTS_BASE`). CI prints that list. Reviewers and agents classify each line using this doc. The list does not fail the job; tautologies and excuses still must not land.

## Agents

Follow this file when writing code. Do not add a comment that restates a function name, a type, or an early return. If a constraint cannot live in a type, test, or lint rule yet, write the smallest keep and link the external rule.
