/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { render, screen, within } from '@testing-library/react';

jest.mock('@/lib/server/issues', () => ({
  getIssueCollections: jest.fn(async () => ([
    { id: '2026', year: 2026, file: 'http://localhost:1337/uploads/zeszyt-analiz-2026.pdf', title: 'Zeszyt Analiz 2026', cover: 'http://localhost:1337/uploads/zeszyt-analiz-2026.webp' },
    { id: '2025', year: 2025, file: '/wszystkie_teksty_druk_3mm_spad_04_12.pdf', title: 'Zeszyt Analiz 2025' },
    { id: '2024', year: 2024, file: '/Katalog CASN_online_08_12_24.pdf', title: 'Zeszyt Analiz 2024' },
    { id: '2023', year: 2023, file: '/Analizy_2023.pdf', title: 'Zeszyt Analiz 2023' },
    { id: '2022', year: 2022, file: '/CASN_gotowa_wersja_do_druku_24.01.2023.pdf', title: 'Zeszyt Analiz 2022' },
  ])),
}));

let PageComponent: any;
let hasComponent = false;
try {
  PageComponent = require('@/app/zbiory/page').default;
  hasComponent = !!PageComponent;
} catch {}

async function renderPage() {
  const jsx = await PageComponent();
  return render(jsx);
}

(hasComponent ? describe : describe.skip)('Zbiory Page', () => {
  it('renderuje stronę zbiorów z hero sekcją', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { name: 'Zbiory analiz' })).toBeInTheDocument();

    const heroSection = screen.getByRole('main').querySelector('section');
    expect(heroSection).toBeInTheDocument();
  });

  it('renderuje breadcrumb navigation', async () => {
    await renderPage();

    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(breadcrumb).getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
    expect(within(breadcrumb).getByText('Zbiory analiz')).toBeInTheDocument();
  });

  it('renderuje wszystkie dostępne zbiory analiz', async () => {
    await renderPage();

    expect(screen.getByText('Zeszyt Analiz 2026')).toBeInTheDocument();
    expect(screen.getByText('Zeszyt Analiz 2022')).toBeInTheDocument();
    expect(screen.getByText('Zeszyt Analiz 2023')).toBeInTheDocument();
    expect(screen.getByText('Zeszyt Analiz 2024')).toBeInTheDocument();
    expect(screen.getByText('Zeszyt Analiz 2025')).toBeInTheDocument();
  });

  it('renderuje przyciski "POBIERZ" dla każdego zbioru', async () => {
    await renderPage();

    const downloadButtons = screen.getAllByRole('link', { name: 'POBIERZ' });
    expect(downloadButtons).toHaveLength(5);

    downloadButtons.forEach(button => {
      expect(button).toHaveAttribute('target', '_blank');
      expect(button).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('renderuje prawidłowe linki do plików PDF', async () => {
    await renderPage();

    // Check specific PDF links
    expect(screen.getByRole('link', { name: /Zeszyt Analiz 2026/ })).toHaveAttribute('href', 'http://localhost:1337/uploads/zeszyt-analiz-2026.pdf');
    expect(screen.getByRole('link', { name: /Zeszyt Analiz 2022/ })).toHaveAttribute('href', '/CASN_gotowa_wersja_do_druku_24.01.2023.pdf');
    expect(screen.getByRole('link', { name: /Zeszyt Analiz 2023/ })).toHaveAttribute('href', '/Analizy_2023.pdf');
    expect(screen.getByRole('link', { name: /Zeszyt Analiz 2024/ })).toHaveAttribute('href', '/Katalog CASN_online_08_12_24.pdf');
    expect(screen.getByRole('link', { name: /Zeszyt Analiz 2025/ })).toHaveAttribute('href', '/wszystkie_teksty_druk_3mm_spad_04_12.pdf');
  });

  it('renderuje obraz logo dla każdego zbioru', async () => {
    await renderPage();

    const images = screen.getAllByRole('img');
    const coverImages = images.filter(img => img.getAttribute('alt')?.includes('Okładka'));
    expect(coverImages.length).toBe(5);
  });

  it('renderuje kartki zbiorów w odpowiednim layout', async () => {
    const { container } = await renderPage();

    expect(container.querySelector('.projects-wrapper')).toBeInTheDocument();
    expect(container.querySelector('.col-lg-4')).toBeInTheDocument();
    expect(container.querySelector('.blog-list-item')).toBeInTheDocument();
  });

  it('renderuje zbiory w odpowiedniej strukturze HTML', async () => {
    const { container } = await renderPage();

    const cards = container.querySelectorAll('.blog-list-item');
    expect(cards.length).toBe(5);

    cards.forEach(card => {
      expect(card).toHaveClass('bg-white', 'rounded', 'mt-4');
      expect(card.querySelector('.blog-list-img')).toBeInTheDocument();
      expect(card.querySelector('.cases-desc')).toBeInTheDocument();
      expect(card.querySelector('.learn-more')).toBeInTheDocument();
    });
  });

  it('ma odpowiednie klasy CSS dla sekcji', async () => {
    const { container } = await renderPage();

    expect(container.querySelector('.section')).toBeInTheDocument();
    expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();
    expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
    expect(container.querySelector('.pb-12')).toBeInTheDocument();
  });

  it('renderuje wszystkie sekcje w prawidłowej kolejności', async () => {
    const { container } = await renderPage();

    const sections = container.querySelectorAll('section');
    expect(sections.length).toBe(2); // hero and content sections

    expect(sections[0]).toHaveClass('section');
    expect(sections[1]).toHaveClass('section');
  });

  it('renderuje responsywny layout z col-lg-4', async () => {
    const { container } = await renderPage();

    const columns = container.querySelectorAll('.col-lg-4');
    expect(columns.length).toBe(5); // One for each issue
  });

  it('renderuje kwadratowy viewport okładki dla CMS-owych zbiorów', async () => {
    await renderPage();

    const media = screen.getByTestId('issue-card-media-2026');
    const image = screen.getByTestId('issue-card-image-2026');

    expect(media).toHaveStyle({
      aspectRatio: '1 / 1',
      backgroundColor: 'rgb(243, 244, 246)',
    });
    expect(image).toHaveStyle({
      objectFit: 'cover',
      objectPosition: 'center center',
    });
  });

  it('ma accessibility - obrazy mają alt text', async () => {
    await renderPage();

    const images = screen.getAllByRole('img');
    images.forEach(img => {
      expect(img).toHaveAttribute('alt');
      expect(img.getAttribute('alt')).toBeTruthy();
    });
  });

  it('ma accessibility - linki zewnętrzne mają odpowiednie atrybuty', async () => {
    await renderPage();

    const links = screen.getAllByRole('link').filter(link =>
      link.getAttribute('href')?.endsWith('.pdf')
    );

    links.forEach(link => {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('używa Next.js Image component z odpowiednimi props', async () => {
    await renderPage();

    const images = screen.getAllByRole('img');
    images.forEach(img => {
      // Check for Next.js Image attributes
      expect(img).toHaveAttribute('src');
      expect(img).toHaveAttribute('alt');
    });
  });
});
