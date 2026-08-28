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
  passed over the six changed source/test files.
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
