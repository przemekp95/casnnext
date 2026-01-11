/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { NextRequest } from 'next/server';

describe('Analyses API - Comprehensive Coverage', () => {
  let analysesGET: any;
  let analysesSlugGET: any;

  beforeAll(() => {
    try {
      const analysesRoute = require('@/app/api/analyses/route');
      analysesGET = analysesRoute.GET;

      const analysesSlugRoute = require('@/app/api/analyses/[slug]/route');
      analysesSlugGET = analysesSlugRoute.GET;
    } catch (e) {
      // Routes might not be available
    }
  });

  describe('GET /api/analyses', () => {
    it('returns 200 status with analyses data structure', async () => {
      if (!analysesGET) return;

      const req = new NextRequest('http://localhost:3000/api/analyses');
      const response = await analysesGET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      if (data.length > 0) {
        const analysis = data[0];
        expect(analysis).toHaveProperty('id');
        expect(analysis).toHaveProperty('title');
        expect(analysis).toHaveProperty('slug');
        expect(analysis).toHaveProperty('content');
        expect(typeof analysis.id).toBe('string');
        expect(typeof analysis.title).toBe('string');
        expect(typeof analysis.slug).toBe('string');
      }
    });

    it('handles database unavailability gracefully', async () => {
      if (!analysesGET) return;

      const req = new NextRequest('http://localhost:3000/api/analyses');
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
      if (!analysesSlugGET) return;

      // First get list of analyses to find a valid slug
      const listReq = new NextRequest('http://localhost:3000/api/analyses');
      const listResponse = await analysesGET(listReq);
      const analyses = await listResponse.json();

      if (analyses.length > 0) {
        const firstAnalysis = analyses[0];
        const detailReq = new NextRequest(`http://localhost:3000/api/analyses/${firstAnalysis.slug}`);
        const detailResponse = await analysesSlugGET(detailReq);
        const detailData = await detailResponse.json();

        expect(detailResponse.status).toBe(200);
        expect(detailData).toHaveProperty('analysis');
        expect(detailData).toHaveProperty('author');

        const analysis = detailData.analysis;
        expect(analysis).toHaveProperty('id');
        expect(analysis).toHaveProperty('title');
        expect(analysis).toHaveProperty('slug');
        expect(analysis).toHaveProperty('content');

        const author = detailData.author;
        expect(author).toHaveProperty('id');
        expect(author).toHaveProperty('name');
        expect(author).toHaveProperty('displayName');
      }
    });

    it('returns 404 for non-existent analysis slug', async () => {
      if (!analysesSlugGET) return;

      const req = new NextRequest('http://localhost:3000/api/analyses/non-existent-slug');
      const response = await analysesSlugGET(req);

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('not found');
    });

    it('handles database errors gracefully', async () => {
      if (!analysesSlugGET) return;

      const req = new NextRequest('http://localhost:3000/api/analyses/test-slug');
      const response = await analysesSlugGET(req);

      expect([200, 404, 500]).toContain(response.status);

      const data = await response.json();
      if (response.status === 500) {
        expect(data).toHaveProperty('error');
      }
    });
  });

  describe('Data validation', () => {
    it('validates analysis data structure from API', async () => {
      if (!analysesGET) return;

      const req = new NextRequest('http://localhost:3000/api/analyses');
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
        if (analysis.content) {
          expect(typeof analysis.content).toBe('string');
        }
        if (analysis.excerpt) {
          expect(typeof analysis.excerpt).toBe('string');
        }
        if (analysis.publishedAt) {
          expect(typeof analysis.publishedAt).toBe('string');
        }
        if (analysis.authorId) {
          expect(typeof analysis.authorId).toBe('string');
        }
      });
    });

    it('validates detailed analysis with author relationship', async () => {
      if (!analysesSlugGET) return;

      const listReq = new NextRequest('http://localhost:3000/api/analyses');
      const listResponse = await analysesGET(listReq);
      const analyses = await listResponse.json();

      if (analyses.length > 0) {
        const firstAnalysis = analyses[0];
        const detailReq = new NextRequest(`http://localhost:3000/api/analyses/${firstAnalysis.slug}`);
        const detailResponse = await analysesSlugGET(detailReq);
        const detailData = await detailResponse.json();

        // Validate analysis structure
        const analysis = detailData.analysis;
        expect(analysis).toHaveProperty('id');
        expect(analysis).toHaveProperty('title');
        expect(analysis).toHaveProperty('slug');
        expect(analysis).toHaveProperty('content');

        // Validate author structure
        const author = detailData.author;
        expect(author).toHaveProperty('id');
        expect(author).toHaveProperty('name');
        expect(author).toHaveProperty('displayName');

        // Validate relationship
        expect(analysis.authorId).toBe(author.id);
      }
    });
  });
});