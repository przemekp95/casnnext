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

  it('normalizes domanska and forces balcerowski placeholder image', () => {
    const domanskaEntity = {
      id: 11,
      attributes: {
        slug: 'domanska',
        name: 'dr Aldona Domańska',
        displayName: 'dr Aldona Domańska',
        bio: 'Bio test',
        legacyImgPath: '/images/wrong-domanska.png',
        avatar: {
          data: {
            id: 101,
            attributes: {
              url: '/uploads/wrong-domanska.png',
            },
          },
        },
      },
    };

    const balcerowskiEntity = {
      id: 12,
      attributes: {
        slug: 'balcerowski',
        name: 'dr Piotr Balcerowski',
        displayName: 'dr Piotr Balcerowski',
        bio: 'Bio test',
        legacyImgPath: '/images/wrong-balcerowski.png',
        avatar: {
          data: {
            id: 102,
            attributes: {
              url: '/uploads/wrong-balcerowski.png',
            },
          },
        },
      },
    };

    const domanska = mapCmsAuthor(domanskaEntity);
    const balcerowski = mapCmsAuthor(balcerowskiEntity);

    expect(domanska).not.toBeNull();
    expect(domanska?.name).toBe('prof. Agnieszka Domańska');
    expect(domanska?.displayName).toBe('prof. Agnieszka Domańska');
    expect(domanska?.avatarUrl).toBeNull();
    expect(domanska?.legacyImgPath).toBe('/images/Domanska.png');
    expect(cmsAuthorToAuthorRow(domanska!).img).toBe('/images/Domanska.png');

    expect(balcerowski).not.toBeNull();
    expect(balcerowski?.avatarUrl).toBeNull();
    expect(balcerowski?.legacyImgPath).toBe('/images/placeholder.png');
    expect(cmsAuthorToAuthorRow(balcerowski!).img).toBe('/images/placeholder.png');
  });

  it('normalizes overridden authors nested inside analysis payloads', () => {
    const analysisEntity = {
      id: 41,
      attributes: {
        legacyId: 41,
        slug: 'domanska-artykul',
        title: 'Test',
        contentMdx: '# Test',
        author: {
          data: {
            id: 13,
            attributes: {
              slug: 'domanska',
              name: 'dr Aldona Domańska',
              displayName: 'dr Aldona Domańska',
              bio: 'Bio',
              legacyImgPath: '/images/wrong-domanska.png',
              avatar: {
                data: {
                  id: 103,
                  attributes: {
                    url: '/uploads/wrong-domanska.png',
                  },
                },
              },
            },
          },
        },
      },
    };

    const cmsAnalysis = mapCmsAnalysis(analysisEntity);
    expect(cmsAnalysis).not.toBeNull();

    const row = cmsAnalysisToAnalysisRow(cmsAnalysis!);
    expect(row.author?.name).toBe('prof. Agnieszka Domańska');
    expect(row.author?.img).toBe('/images/Domanska.png');

    const detail = cmsAnalysisToAnalysisDetail(cmsAnalysis!);
    expect(detail.author?.name).toBe('prof. Agnieszka Domańska');
    expect(detail.author?.img).toBe('/images/Domanska.png');
  });

  it('normalizes academic title casing to lowercase', () => {
    const authorEntity = {
      id: 14,
      attributes: {
        slug: 'jan-nowak',
        name: 'Prof Jan Nowak',
        displayName: 'Adw. Dr Jan Nowak',
        bio: null,
        legacyImgPath: null,
      },
    };

    const author = mapCmsAuthor(authorEntity);
    expect(author).not.toBeNull();
    expect(author?.name).toBe('prof. Jan Nowak');
    expect(author?.displayName).toBe('adw. dr Jan Nowak');
  });
});
