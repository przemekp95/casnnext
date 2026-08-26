export type LegacyAnalysisRedirect = {
  source: string;
  destination: string;
  permanent: true;
};

export const legacyAnalysisRedirects: LegacyAnalysisRedirect[] = [
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
];
