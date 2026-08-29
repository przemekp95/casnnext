# Task 9 implementation report

## Scope

Implemented the planned `next/image` boundary at `SafeImage`, the shared Jest
renderer, and the authors-client test. During the required main typecheck, the
exact `SafeImageProps` contract exposed the adjacent MDX adapter's broader HTML
image input (`string | number` dimensions and optional source/alt). The task
owner approved a minimal scope expansion to `components/mdx/MDXContent.tsx` and
`test/unit/components/MDXContent.test.tsx`; `SafeImageProps` was not widened.

## RED

- `npx jest --runInBand --runTestsByPath test/unit/components/SafeImage.test.tsx`
  failed as intended before production edits: the literal `80x60` image did not
  carry the Next Image mock marker (`data-next-image="true"`). This demonstrated
  that `SafeImage` still rendered raw `<img>`.
- The focused MDX adapter RED failed as intended before its production fix:
  invalid HTML dimensions (`width="wide"`, `height="tall"`) reached the image
  renderer instead of being omitted at the typed Next Image boundary.

## GREEN

- `SafeImageProps` is exactly
  `Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'> & { src: string; alt: string }`.
  `SafeImage` renders `next/image` with forced `unoptimized={true}`, while
  retaining source string normalization and empty-value fallbacks.
- The sole raw `<img>` renderer is `test/__mocks__/nextImageMock.tsx`; no inline
  ESLint suppression was added. The authors-client test now uses that shared
  renderer instead of its own raw-image mock.
- The MDX adapter preserves valid numeric HTML dimensions (including MDX's
  string attributes), normalizes its existing missing source/alt behavior, and
  omits non-finite or nonnumeric dimensions that the Next Image contract cannot
  accept.
- Focused Jest: `SafeImage`, `authors-client`, and `MDXContent` all passed:
  3 suites, 11 tests.
- Main typecheck passed: `npm run type-check`.
- Exact-file ESLint with `@next/next/no-img-element:error --max-warnings 0`
  passed over the five non-mock files: `SafeImage`, the MDX adapter, and their
  focused tests plus the authors-client test. The raw `<img>` in
  `test/__mocks__/nextImageMock.tsx` is the exact plan-approved Jest-renderer
  exception; it is checked by the first-party policy later, not falsely claimed
  as passing the forced no-img rule.
- One and only one protected disposable hydration invocation ran after a clear
  port-31337 preflight: Cypress hydration passed 9/9 with 0 failing, 0 pending,
  and 0 skipped. The harness reported `verified=1` cleanup for its owned
  `casn-quality-1509410-fa07635d583c-mysql` container,
  `/tmp/casn-quality.F6pisE`, and app PID `1526391`; port 31337 was clear after
  cleanup.
- `scripts/ci/with-disposable-app.sh` remained identical to `87e518d` and its
  protected SHA-256 remained
  `10253ea47aa9d3b0f93d6de1482c13207a1eaef3a3c85e5e0e8eea1516aa71b4`.

## Warnings and skips

No test, lint, typecheck, hydration, or cleanup warnings were emitted. No
tests were skipped, and no out-of-scope resources, ports, Directus, remote, or
production systems were touched.

## Commit

`refactor(images): use Next Image at first-party boundaries`

## Review-fix follow-up

The independent review found that the first adapter could send absent, one-sided,
or invalid dimensions to the installed real `next/image`, which throws when a
non-fill image lacks a complete pair. It also found that the prior Jest mock did
not fail when forced `unoptimized` was removed, and that the old missing-alt test
looked like a valid typed call despite `alt` being required.

### Review RED

- Focused `SafeImage` and MDX component tests failed before the repair because
  the mock did not expose `unoptimized` or reject an unpaired image, and MDX
  forwarded incomplete or invalid dimensions instead of a real-Image-compatible
  pair.
- A direct `renderToStaticMarkup` probe against installed `next/image` confirmed
  that missing dimensions and `width="80px"` are rejected, while `width={0}`,
  `height={0}`, and `style={{ width: 'auto', height: 'auto' }}` render safely.

### Review GREEN

- The MDX adapter now accepts a pair only when both dimensions are finite,
  nonnegative numbers or digit-only strings. Missing, one-sided, whitespace,
  signed, scientific, hexadecimal, CSS-suffixed, negative, and non-finite values
  use paired `0x0` dimensions with `width/height: auto`, preserving the former
  dimensionless raw-image layout without inventing a ratio or fill wrapper.
- The shared exact mock enforces the same paired-dimension boundary unless
  `fill` is present, and exposes `data-next-image-unoptimized` so a regression
  that removes `unoptimized={true}` fails visibly.
- The mutation-sensitive MDX tests cover valid numeric/digit pairs, missing and
  one-sided values, invalid grammar, remaining attribute forwarding, dropped
  `srcSet`, and the `0x0` auto fallback. The missing-alt test now explicitly
  crosses the invalid runtime boundary with a `SafeImageProps` cast and complete
  dimensions.
- Focused Jest including legacy CMS media passed: 4 suites, 26 tests.
- Main typecheck, five-file forced no-img lint, ordinary mock lint, and the
  direct real-Image SSR probe all passed.
- One authorized review-fix hydration rerun followed the static gates: 9/9
  Cypress tests passed with 0 failing, pending, or skipped. Owned cleanup was
  verified for `casn-quality-2450169-79811844f298-mysql`,
  `/tmp/casn-quality.yU7T48`, and app PID `2467160`; port 31337 was clear before
  and after. This rerun is additional review-fix evidence, not a replacement for
  the original Task 9 hydration run.
- The protected harness remained byte-identical to `87e518d` with SHA-256
  `10253ea47aa9d3b0f93d6de1482c13207a1eaef3a3c85e5e0e8eea1516aa71b4`.

## Review-fix commit

`fix(images): preserve dimensionless MDX rendering`

## Second review-fix follow-up

The second review found that the first repair still treated `fill` as a
dimensionless non-fill image, let fallback `auto` styles override explicit MDX
author styles, preserved leading-zero string dimensions instead of matching the
installed component's numeric output, and did not make the mock reject invalid
`fill` combinations.

### Second review RED

- Focused tests failed before the repair because explicit `50%`/`25%` author
  styles were replaced by `auto`, `fill` received synthetic `0x0` dimensions,
  leading-zero dimensions rendered as `080`/`060`, and fill-specific mock
  validation did not throw.

### Second review GREEN

- MDX runtime props explicitly model `fill?: boolean`. The `fill` branch
  forwards `fill` and the caller style unchanged, with neither synthetic
  dimensions nor `auto` styles. For non-fill fallback, defaults are merged
  first, so explicit author `width`/`height` values win.
- Dimension normalization returns only finite, nonnegative numbers. Digit-only
  strings are normalized through `Number`, so `080` and `060` become `80` and
  `60`; non-finite numeric conversions fall back.
- The exact mock rejects width/height or `style.width`/`style.height` when
  `fill` is true while allowing unrelated caller styles; it retains paired
  validation for non-fill images.
- Mutation-sensitive focused tests including legacy CMS media passed: 4 suites,
  29 tests. Main typecheck, five-file forced no-img lint, and ordinary mock lint
  passed.
- Direct installed-`next/image` `renderToStaticMarkup` probes passed for author
  style precedence, the fill branch without synthetic dimensions/auto style,
  and leading-zero normalization.
- No third hydration/E2E/build/resource run was performed: these branch-specific
  SSR and unit probes directly cover the review findings, and both prior
  hydration runs remain recorded above.
- The protected disposable harness remains byte-identical to `87e518d` with
  SHA-256 `10253ea47aa9d3b0f93d6de1482c13207a1eaef3a3c85e5e0e8eea1516aa71b4`.

## Second review-fix commit

`fix(images): preserve MDX image layout contracts`

## Final review mock-fidelity follow-up

The final review passed Task 9 and identified one Minor test-only fidelity gap:
the mock rejected a real Next-compatible fill combination of absent or numeric
zero dimensions and `100%` width/height styles.

### Final review RED/GREEN

- The new `SafeImage` RED rendered `fill` with `width={0}`, `height={0}`, and
  `style={{ width: '100%', height: '100%', objectFit: 'cover' }}`. The old mock
  rejected it with its blanket fill-dimension error.
- The mock now accepts absent or numeric-zero dimensions and absent or exactly
  `100%` width/height styles for `fill`; it still rejects nonzero dimensions and
  incompatible dimension styles such as `50%`, while allowing unrelated styles.
- Focused SafeImage and MDX tests passed: 2 suites, 28 tests. Main typecheck,
  five-file forced no-img lint, ordinary mock lint, diff, protected harness hash,
  and clean status checks passed.
- No production source, hydration, build, or disposable resource action ran for
  this test/mock-only forward fix.

## Final review mock-fidelity commit

`test(images): align Next Image fill mock`
