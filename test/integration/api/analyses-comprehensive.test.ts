/** @jest-environment node */

import { jest } from '@jest/globals';
import type { AnalysisDetail, AnalysisRow } from '@/types/analysis';

type AnalysesRoute = typeof import('@/app/api/analyses/route');
type AnalysesSlugRoute = typeof import('@/app/api/analyses/[slug]/route');
type AnalysesModule = typeof import('@/lib/analyses');

const analysisFixture = {
  id: 'analysis-1',
  slug: 'first-analysis',
  title: 'First analysis',
  authorId: 'author-1',
  contentMdx: '# First',
} satisfies AnalysisRow & Pick<AnalysisDetail, 'contentMdx'>;

const analysisDetailFixture = {
  ...analysisFixture,
  author: {
    id: 'author-1',
    slug: 'first-author',
    name: 'First Author',
    bio: 'First author biography',
  },
} satisfies AnalysisDetail & Pick<AnalysisRow, 'authorId'>;

const createSlugContext = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe('Analyses API', () => {
  let analysesRoute: AnalysesRoute;
  let analysesSlugRoute: AnalysesSlugRoute;
  let getAnalysesMock: jest.MockedFunction<AnalysesModule['getAnalyses']>;
  let getAnalysisBySlugMock: jest.MockedFunction<AnalysesModule['getAnalysisBySlug']>;

  beforeEach(async () => {
    jest.resetModules();
    getAnalysesMock = jest.fn<AnalysesModule['getAnalyses']>();
    getAnalysisBySlugMock = jest.fn<AnalysesModule['getAnalysisBySlug']>();
    jest.doMock('@/lib/analyses', () => ({
      getAnalyses: getAnalysesMock,
      getAnalysisBySlug: getAnalysisBySlugMock,
    }));

    analysesRoute = await import('@/app/api/analyses/route');
    analysesSlugRoute = await import('@/app/api/analyses/[slug]/route');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/analyses', () => {
    it('returns the fixed analysis fixture', async () => {
      getAnalysesMock.mockResolvedValue([analysisFixture]);

      const response = await analysesRoute.GET();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([expect.objectContaining(analysisFixture)]);
    });

    it('returns the exact internal-server-error response when the query fails', async () => {
      getAnalysesMock.mockRejectedValue(new Error('database unavailable'));

      const response = await analysesRoute.GET();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/analyses/[slug]', () => {
    it('returns the fixed detail fixture for an existing slug', async () => {
      getAnalysisBySlugMock.mockResolvedValue(analysisDetailFixture);

      const response = await analysesSlugRoute.GET(
        new Request('http://localhost:3000/api/analyses/first-analysis'),
        createSlugContext('first-analysis'),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(analysisDetailFixture);
    });

    it('returns the exact not-found response for an unknown slug', async () => {
      getAnalysisBySlugMock.mockResolvedValue(null);

      const response = await analysesSlugRoute.GET(
        new Request('http://localhost:3000/api/analyses/missing-analysis'),
        createSlugContext('missing-analysis'),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Analysis not found' });
    });

    it('returns the exact internal-server-error response when the detail query fails', async () => {
      getAnalysisBySlugMock.mockRejectedValue(new Error('database unavailable'));

      const response = await analysesSlugRoute.GET(
        new Request('http://localhost:3000/api/analyses/first-analysis'),
        createSlugContext('first-analysis'),
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
    });
  });
});
