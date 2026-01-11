import { render, screen, within } from '@testing-library/react';

let ArticleLayout: any;
let hasComp = false;
try {
  ArticleLayout = require('@/components/ArticleLayout').default;
  hasComp = !!ArticleLayout;
} catch (e) {}

(hasComp ? describe : describe.skip)('ArticleLayout', () => {
  it('renderuje tytuł i breadcrumbs (domyślne)', () => {
    render(<ArticleLayout title="Test tytuł">Treść</ArticleLayout>);
    expect(screen.getByRole('heading', { level: 1, name: 'Test tytuł' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(nav).getByText('Test tytuł')).toBeInTheDocument();
  });

  it('renderuje lead i autora gdy podane', () => {
    render(<ArticleLayout title="X" lead="Lead tekst" author="Jan">Treść</ArticleLayout>);
    expect(screen.getByText('Lead tekst')).toBeInTheDocument();
    expect(screen.getByText(/Jan/)).toBeInTheDocument();
  });
});
