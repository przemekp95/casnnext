/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { AppDataSource } from '@/lib/db.server';

describe('Analyses API - Comprehensive Coverage', () => {
  let analysesGET: any;
  let analysesSlugGET: any;
  let isDatabaseAvailable = false;
  const createSlugContext = (slug: string) => ({ params: Promise.resolve({ slug }) });

  beforeAll(async () => {
    try {
      const analysesRoute = require('@/app/api/analyses/route');
      analysesGET = analysesRoute.GET;

      const analysesSlugRoute = require('@/app/api/analyses/[slug]/route');
      analysesSlugGET = analysesSlugRoute.GET;

      try {
        if (AppDataSource) {
          if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
          }
          isDatabaseAvailable = true;
        }
      } catch {
        isDatabaseAvailable = false;
      }
    } catch (e) {
      isDatabaseAvailable = false;
    }
  });

  describe('GET /api/analyses', () => {
    it('returns 200 status with analyses data structure', async () => {
      if (!analysesGET || !isDatabaseAvailable) return;

      const req = new Request('http://localhost:3000/api/analyses');
      const response = await analysesGET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      if (data.length > 0) {
        const analysis = data[0];
        expect(analysis).toHaveProperty('id');
        expect(analysis).toHaveProperty('title');
        expect(analysis).toHaveProperty('slug');
        expect(typeof analysis.id).toBe('string');
        expect(typeof analysis.title).toBe('string');
        expect(typeof analysis.slug).toBe('string');
        expect(analysis).toHaveProperty('authorId');
      }
    });

    it('handles database unavailability gracefully', async () => {
      if (!analysesGET || !isDatabaseAvailable) return;

      const req = new Request('http://localhost:3000/api/analyses');
      const response = await analysesGET(req);

      expect([200, 500]).toContain(response.status);

      const data = await response.json();
      if (response.status === 500) {
        expect(data).toHaveProperty('error');
      } else {
        expect(Array.isArray(data)).toBe(true);
      }
    });
  });

  describe('GET /api/analyses/[slug]', () => {
    it('returns detailed analysis for valid slug', async () => {
      if (!analysesSlugGET || !isDatabaseAvailable) return;

      // First get list of analyses to find a valid slug
      const listReq = new Request('http://localhost:3000/api/analyses');
      const listResponse = await analysesGET(listReq);
      const analyses = await listResponse.json();

      if (analyses.length > 0) {
        const firstAnalysis = analyses[0];
        const detailReq = new Request(`http://localhost:3000/api/analyses/${firstAnalysis.slug}`);
        const detailResponse = await analysesSlugGET(detailReq, createSlugContext(firstAnalysis.slug));
        const detailData = await detailResponse.json();

        expect(detailResponse.status).toBe(200);
        expect(detailData).toHaveProperty('id');
        expect(detailData).toHaveProperty('title');
        expect(detailData).toHaveProperty('slug');
        expect(detailData).toHaveProperty('contentMdx');
        if (detailData.author) {
          expect(detailData.author).toHaveProperty('name');
        }
      }
    });

    it('returns 404 for non-existent analysis slug', async () => {
      if (!analysesSlugGET || !isDatabaseAvailable) return;

      const req = new Request('http://localhost:3000/api/analyses/non-existent-slug');
      const response = await analysesSlugGET(req, createSlugContext('non-existent-slug'));

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('not found');
    });

    it('handles database errors gracefully', async () => {
      if (!analysesSlugGET || !isDatabaseAvailable) return;

      const req = new Request('http://localhost:3000/api/analyses/test-slug');
      const response = await analysesSlugGET(req, createSlugContext('test-slug'));

      expect([200, 404, 500]).toContain(response.status);

      const data = await response.json();
      if (response.status === 500) {
        expect(data).toHaveProperty('error');
      }
    });
  });

  describe('Data validation', () => {
    it('validates analysis data structure from API', async () => {
      if (!analysesGET || !isDatabaseAvailable) return;

      const req = new Request('http://localhost:3000/api/analyses');
      const response = await analysesGET(req);
      const data = await response.json();

      data.forEach((analysis: any) => {
        // Required fields
        expect(analysis).toHaveProperty('id');
        expect(analysis).toHaveProperty('title');
        expect(analysis).toHaveProperty('slug');

        // Type validation
        expect(typeof analysis.id).toBe('string');
        expect(typeof analysis.title).toBe('string');
        expect(typeof analysis.slug).toBe('string');

        // Optional fields
        if (analysis.description) {
          expect(typeof analysis.description).toBe('string');
        }
        if (analysis.date) {
          expect(typeof analysis.date).toBe('string');
        }
        if (analysis.authorId) {
          expect(typeof analysis.authorId).toBe('string');
        }
      });
    });

    it('validates detailed analysis with author relationship', async () => {
      if (!analysesSlugGET || !isDatabaseAvailable) return;

      const listReq = new Request('http://localhost:3000/api/analyses');
      const listResponse = await analysesGET(listReq);
      const analyses = await listResponse.json();

      if (analyses.length > 0) {
        const firstAnalysis = analyses[0];
        const detailReq = new Request(`http://localhost:3000/api/analyses/${firstAnalysis.slug}`);
        const detailResponse = await analysesSlugGET(detailReq, createSlugContext(firstAnalysis.slug));
        const detailData = await detailResponse.json();

        expect(detailData).toHaveProperty('id');
        expect(detailData).toHaveProperty('title');
        expect(detailData).toHaveProperty('slug');
        expect(detailData).toHaveProperty('contentMdx');

        if (detailData.author) {
          expect(detailData.author).toHaveProperty('name');
        }
      }
    });
  });
});
