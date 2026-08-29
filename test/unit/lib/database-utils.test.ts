import { AppDataSource } from '../../__mocks__/@/lib/db';

describe('database test fixtures', () => {
  it('returns exactly the fixed author collection', async () => {
    const result = await AppDataSource.getRepository('Author').find({
      order: { name: 'ASC' },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'author-1', slug: 'first-author' });
  });

  it('returns exactly the fixed analysis collection', async () => {
    const result = await AppDataSource.getRepository('Analysis').find();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'analysis-1',
      slug: 'first-analysis',
      authorId: 'author-1',
    });
  });
});
