import { legacyAnalysisRedirects } from '@/lib/routing/legacy-analysis-redirects';

describe('legacy analysis redirects', () => {
  it('permanently redirects every supported legacy slug route to the canonical analysis route', () => {
    expect(legacyAnalysisRedirects).toEqual([
      {
        source: '/analiza/:slug',
        destination: '/analizy/:slug',
        permanent: true,
      },
      {
        source: '/analysis/:slug',
        destination: '/analizy/:slug',
        permanent: true,
      },
      {
        source: '/articles/:slug',
        destination: '/analizy/:slug',
        permanent: true,
      },
    ]);
  });
});
