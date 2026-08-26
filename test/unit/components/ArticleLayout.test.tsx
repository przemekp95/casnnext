import { render, screen, within } from '@testing-library/react';
import ArticleLayout from '@/components/ArticleLayout';

describe('ArticleLayout', () => {
  it('renders the title, breadcrumb, and article content', () => {
    render(<ArticleLayout title="Test tytuł">Treść artykułu</ArticleLayout>);

    expect(screen.getByRole('heading', { level: 1, name: 'Test tytuł' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: /breadcrumb/i })).getByText('Test tytuł')).toBeInTheDocument();
    expect(within(screen.getByRole('article')).getByText('Treść artykułu')).toBeInTheDocument();
  });

  it('renders supplied lead, author, and date metadata', () => {
    render(
      <ArticleLayout title="X" lead="Lead tekst" author="Jan" date="26 sierpnia 2026">
        Treść artykułu
      </ArticleLayout>,
    );

    expect(screen.getByText('Lead tekst')).toBeInTheDocument();
    expect(screen.getByText('Autor:')).toBeInTheDocument();
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Data:')).toBeInTheDocument();
    expect(screen.getByText('26 sierpnia 2026')).toBeInTheDocument();
  });
});
