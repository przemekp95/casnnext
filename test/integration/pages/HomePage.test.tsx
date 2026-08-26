import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('Homepage', () => {
  it('renderuje główną sekcję z hero', async () => {
    render(await HomePage());

    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();

    // Check for main section structure
    const heroSection = screen.getByRole('main').querySelector('section');
    expect(heroSection).toBeInTheDocument();
    expect(heroSection).toHaveClass('section');
  });

  it('renderuje sekcję "about" z prawidłowym tekstem', () => {
    render(<HomePage />);

    expect(screen.getByText(/Choć niepodległość państwowa/)).toBeInTheDocument();
    expect(screen.getByText(/Dążymy do dostarczenia najwyższej jakości/)).toBeInTheDocument();
    expect(screen.getByText(/Przeczytaj analizy/)).toBeInTheDocument();
  });

  it('renderuje link do analizy z prawidłowym href', () => {
    render(<HomePage />);

    const link = screen.getByRole('link', { name: /Przeczytaj analizy/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/analizy');
  });

  it('renderuje wszystkie obrazy z odpowiednimi atrybutami', () => {
    render(<HomePage />);

    // Check for Next.js Image components (they render as img tags)
    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThan(0);

    // Check for specific images
    expect(screen.getByAltText('Ikonka')).toBeInTheDocument();
    expect(screen.getByAltText('Praca CASN')).toBeInTheDocument();
  });

  it('ma odpowiednie struktury CSS i klasy', () => {
    const { container } = render(<HomePage />);

    // Check for Bootstrap classes
    expect(container.querySelector('.container')).toBeInTheDocument();
    expect(container.querySelector('.row')).toBeInTheDocument();
    expect(container.querySelector('.section')).toBeInTheDocument();
    expect(container.querySelector('.bg-light')).toBeInTheDocument();
  });

  it('renderuje sekcje w prawidłowej kolejności', () => {
    const { container } = render(<HomePage />);

    const sections = container.querySelectorAll('section');
    expect(sections.length).toBe(3); // hero, about, work sections

    // Check section order by content
    const firstSection = sections[0];
    const secondSection = sections[1];
    const thirdSection = sections[2];

    expect(firstSection).toHaveClass('section');
    expect(secondSection).toHaveClass('bg-light', 'section-below-fold');
    expect(thirdSection).toHaveClass('bg-light', 'section-below-fold');
  });

  it('renderuje responsywne layout z col-lg-* klasami', () => {
    const { container } = render(<HomePage />);

    const columns = container.querySelectorAll('[class*="col-lg-"]');
    expect(columns.length).toBeGreaterThan(0);

    // Check for specific column layouts
    expect(container.querySelector('.col-lg-6')).toBeInTheDocument();
  });

  it('zawiera odpowiednie meta informacje i strukturę', () => {
    render(<HomePage />);

    // Check for semantic HTML structure
    expect(screen.getByRole('main')).toBeInTheDocument();

    // Check for accessibility - images should have alt text
    const images = screen.getAllByRole('img');
    images.forEach(img => {
      expect(img).toHaveAttribute('alt');
    });
  });

  it('renderuje tekst o niepodległości w odpowiednim kontekście', () => {
    render(<HomePage />);

    const textElement = screen.getByText(/Choć niepodległość państwowa/);
    expect(textElement).toBeInTheDocument();

    // Check it's in the about section
    const aboutSection = textElement.closest('section');
    expect(aboutSection).toHaveClass('bg-light');
  });

  it('renderuje call-to-action w sekcji about', () => {
    render(<HomePage />);

    const ctaButton = screen.getByRole('link', { name: /Przeczytaj analizy/i });
    const ctaSection = ctaButton.closest('section');

    expect(ctaSection).toHaveClass('bg-light');
    expect(ctaButton).toHaveClass('btn', 'btn-custom');
  });
});
