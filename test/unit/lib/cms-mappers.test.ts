import {
  mapCmsAuthor,
  mapCmsAnalysis,
  cmsAuthorToAuthorRow,
  cmsAnalysisToAnalysisRow,
  cmsAnalysisToAnalysisDetail,
} from '@/lib/cms/mappers';

describe('CMS mappers', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRAPI_URL = 'https://casn.pl/cms';
  });

  it('maps Strapi author entity to CmsAuthor and AuthorRow', () => {
    const authorEntity = {
      id: 10,
      attributes: {
        legacyId: 34,
        slug: 'pietrzak',
        name: 'Przemysław Pietrzak, LL.M.',
        displayName: 'Przemysław Pietrzak, LL.M.',
        bio: 'Bio test',
        legacyImgPath: '/images/pietrzak.jpg',
        sourceHash: 'hash-1',
        avatar: {
          data: {
            id: 100,
            attributes: {
              url: '/uploads/avatar.png',
            },
          },
        },
      },
    };

    const cmsAuthor = mapCmsAuthor(authorEntity);
    expect(cmsAuthor).not.toBeNull();
    expect(cmsAuthor?.slug).toBe('pietrzak');
    expect(cmsAuthor?.avatarUrl).toBe('https://casn.pl/cms/uploads/avatar.png');

    const row = cmsAuthorToAuthorRow(cmsAuthor!);
    expect(row.slug).toBe('pietrzak');
    expect(row.img).toBe('https://casn.pl/cms/uploads/avatar.png');
    expect(row.legacyId).toBe(34);
  });

  it('maps Strapi analysis entity to AnalysisRow and AnalysisDetail', () => {
    const analysisEntity = {
      id: 38,
      attributes: {
        legacyId: 38,
        slug: 'pietrzak-artykul',
        title: 'Rola społeczeństwa obywatelskiego w legislacji',
        date: '2025-12-11',
        category: 'analizy',
        lead: 'Lead test',
        description: 'Description test',
        contentMdx: '# Test',
        sourceHash: 'hash-analysis',
        author: {
          data: {
            id: 10,
            attributes: {
              slug: 'pietrzak',
              name: 'Przemysław Pietrzak, LL.M.',
              displayName: 'Przemysław Pietrzak, LL.M.',
              bio: 'Bio test',
              legacyImgPath: '/images/pietrzak.jpg',
            },
          },
        },
      },
    };

    const cmsAnalysis = mapCmsAnalysis(analysisEntity);
    expect(cmsAnalysis).not.toBeNull();
    expect(cmsAnalysis?.slug).toBe('pietrzak-artykul');

    const row = cmsAnalysisToAnalysisRow(cmsAnalysis!);
    expect(row.slug).toBe('pietrzak-artykul');
    expect(row.author?.slug).toBe('pietrzak');
    expect(row.date).toBe('2025-12-11');

    const detail = cmsAnalysisToAnalysisDetail(cmsAnalysis!);
    expect(detail.contentMdx).toBe('# Test');
    expect(detail.author?.name).toBe('Przemysław Pietrzak, LL.M.');
  });
});
