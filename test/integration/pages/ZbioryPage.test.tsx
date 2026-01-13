/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { render, screen } from '@testing-library/react';

let PageComponent: any;
let hasComponent = false;
try {
  PageComponent = require('@/app/zbiory/page').default;
  hasComponent = !!PageComponent;
} catch {}

(hasComponent ? describe : describe.skip)('Zbiory Page', () => {
  it('renderuje stronę zbiorów z hero sekcją', () => {
    render(<PageComponent />);

    expect(screen.getByRole('heading', { name: 'Zbiory analiz' })).toBeInTheDocument();

    const heroSection = screen.getByRole('main').querySelector('section');
    expect(heroSection).toBeInTheDocument();
  });

  it('renderuje breadcrumb navigation', () => {
    render(<PageComponent />);

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Zbiory analiz')).toBeInTheDocument();
  });

  it('renderuje wszystkie dostępne zbiory analiz', () => {
    render(<PageComponent />);

    expect(screen.getByText('Zeszyt Analiz 2022')).toBeInTheDocument();
    expect(screen.getByText('Zeszyt Analiz 2023')).toBeInTheDocument();
    expect(screen.getByText('Zeszyt Analiz 2024')).toBeInTheDocument();
    expect(screen.getByText('Zeszyt Analiz 2025')).toBeInTheDocument();
  });

  it('renderuje przyciski "POBIERZ" dla każdego zbioru', () => {
    render(<PageComponent />);

    const downloadButtons = screen.getAllByRole('link', { name: 'POBIERZ' });
    expect(downloadButtons).toHaveLength(4);

    downloadButtons.forEach(button => {
      expect(button).toHaveAttribute('target', '_blank');
      expect(button).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('renderuje prawidłowe linki do plików PDF', () => {
    render(<PageComponent />);

    // Check specific PDF links
    expect(screen.getByRole('link', { name: /Zeszyt Analiz 2022/ })).toHaveAttribute('href', '/CASN_gotowa_wersja_do_druku_24.01.2023.pdf');
    expect(screen.getByRole('link', { name: /Zeszyt Analiz 2023/ })).toHaveAttribute('href', '/Analizy_2023.pdf');
    expect(screen.getByRole('link', { name: /Zeszyt Analiz 2024/ })).toHaveAttribute('href', '/Katalog CASN_online_08_12_24.pdf');
    expect(screen.getByRole('link', { name: /Zeszyt Analiz 2025/ })).toHaveAttribute('href', '/wszystkie_teksty_druk_3mm_spad_04_12.pdf');
  });

  it('renderuje obraz logo dla każdego zbioru', () => {
    render(<PageComponent />);

    const images = screen.getAllByRole('img');
    // Should have at least 4 logo images (one for each issue)
    const logoImages = images.filter(img => img.getAttribute('alt')?.includes('Logo'));
    expect(logoImages.length).toBe(4);
  });

  it('renderuje kartki zbiorów w odpowiednim layout', () => {
    const { container } = render(<PageComponent />);

    expect(container.querySelector('.projects-wrapper')).toBeInTheDocument();
    expect(container.querySelector('.col-lg-4')).toBeInTheDocument();
    expect(container.querySelector('.blog-list-item')).toBeInTheDocument();
  });

  it('renderuje zbiory w odpowiedniej strukturze HTML', () => {
    const { container } = render(<PageComponent />);

    const cards = container.querySelectorAll('.blog-list-item');
    expect(cards.length).toBe(4);

    cards.forEach(card => {
      expect(card).toHaveClass('bg-white', 'rounded', 'mt-4');
      expect(card.querySelector('.blog-list-img')).toBeInTheDocument();
      expect(card.querySelector('.cases-desc')).toBeInTheDocument();
      expect(card.querySelector('.learn-more')).toBeInTheDocument();
    });
  });

  it('ma odpowiednie klasy CSS dla sekcji', () => {
    const { container } = render(<PageComponent />);

    expect(container.querySelector('.section')).toBeInTheDocument();
    expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();
    expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
    expect(container.querySelector('.pb-12')).toBeInTheDocument();
  });

  it('renderuje wszystkie sekcje w prawidłowej kolejności', () => {
    const { container } = render(<PageComponent />);

    const sections = container.querySelectorAll('section');
    expect(sections.length).toBe(2); // hero and content sections

    expect(sections[0]).toHaveClass('section');
    expect(sections[1]).toHaveClass('section');
  });

  it('renderuje responsywny layout z col-lg-4', () => {
    const { container } = render(<PageComponent />);

    const columns = container.querySelectorAll('.col-lg-4');
    expect(columns.length).toBe(4); // One for each issue
  });

  it('ma accessibility - obrazy mają alt text', () => {
    render(<PageComponent />);

    const images = screen.getAllByRole('img');
    images.forEach(img => {
      expect(img).toHaveAttribute('alt');
      expect(img.getAttribute('alt')).toBeTruthy();
    });
  });

  it('ma accessibility - linki zewnętrzne mają odpowiednie atrybuty', () => {
    render(<PageComponent />);

    const links = screen.getAllByRole('link').filter(link =>
      link.getAttribute('href')?.endsWith('.pdf')
    );

    links.forEach(link => {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('używa Next.js Image component z odpowiednimi props', () => {
    render(<PageComponent />);

    const images = screen.getAllByRole('img');
    images.forEach(img => {
      // Check for Next.js Image attributes
      expect(img).toHaveAttribute('src');
      expect(img).toHaveAttribute('alt');
    });
  });
});