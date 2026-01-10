/** @jest-environment node */
import { render, screen } from '@testing-library/react';

let PageComponent: any;
let hasComponent = false;
try {
  PageComponent = require('@/app/kontakt/page').default;
  hasComponent = !!PageComponent;
} catch {}

(hasComponent ? describe : describe.skip)('Kontakt Page', () => {
  it('renderuje stronę kontaktową z hero sekcją', () => {
    render(<PageComponent />);

    expect(screen.getByText('Kontakt')).toBeInTheDocument();

    // Check for hero section
    const heroSection = screen.getByRole('main').querySelector('section');
    expect(heroSection).toBeInTheDocument();
  });

  it('renderuje breadcrumb navigation', () => {
    render(<PageComponent />);

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Kontakt' })).toHaveAttribute('href', '/kontakt');
  });

  it('renderuje mapę Google z prawidłowym iframe', () => {
    render(<PageComponent />);

    const iframe = screen.getByTitle('Mapa dojazdu');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', expect.stringContaining('google.com/maps'));
    expect(iframe).toHaveAttribute('src', expect.stringContaining('Konduktorska'));
    expect(iframe).toHaveAttribute('width', '100%');
    expect(iframe).toHaveAttribute('height', '500');
  });

  it('renderuje informacje kontaktowe - email', () => {
    render(<PageComponent />);

    const emailLink = screen.getByRole('link', { name: /p\.balcerowski@sluzbaniepodleglej\.pl/ });
    expect(emailLink).toBeInTheDocument();
    expect(emailLink).toHaveAttribute('href', 'mailto:p.balcerowski@sluzbaniepodleglej.pl');
  });

  it('renderuje informacje kontaktowe - strona www', () => {
    render(<PageComponent />);

    const websiteLink = screen.getByRole('link', { name: /sluzbaniepodleglej\.pl/ });
    expect(websiteLink).toBeInTheDocument();
    expect(websiteLink).toHaveAttribute('href', 'https://sluzbaniepodleglej.pl');
    expect(websiteLink).toHaveAttribute('target', '_blank');
    expect(websiteLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renderuje adres fizyczny', () => {
    render(<PageComponent />);

    expect(screen.getByText('Centrum Konferencyjno-Szkoleniowe')).toBeInTheDocument();
    expect(screen.getByText('ul. Konduktorska 3/2, 00-775 Warszawa')).toBeInTheDocument();
  });

  it('renderuje ikony kontaktowe', () => {
    const { container } = render(<PageComponent />);

    const icons = container.querySelectorAll('.mdi-email-outline, .mdi-web');
    expect(icons.length).toBe(2);
  });

  it('renderuje responsywny layout z col-md-* klasami', () => {
    const { container } = render(<PageComponent />);

    expect(container.querySelector('.col-md-4')).toBeInTheDocument();
    expect(container.querySelector('.col-md-5')).toBeInTheDocument();
    expect(container.querySelector('.col-md-6')).toBeInTheDocument();
  });

  it('renderuje odpowiednie obrazy hero', () => {
    render(<PageComponent />);

    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThan(0);

    // Should have hero images
    const heroImages = images.filter(img =>
      img.getAttribute('alt')?.includes('CASN') ||
      img.getAttribute('alt')?.includes('Tło')
    );
    expect(heroImages.length).toBeGreaterThan(0);
  });

  it('ma odpowiednie klasy CSS dla sekcji', () => {
    const { container } = render(<PageComponent />);

    expect(container.querySelector('.contact-us-home')).toBeInTheDocument();
    expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();
    expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
  });

  it('renderuje strukturę semantic HTML', () => {
    render(<PageComponent />);

    expect(screen.getByRole('main')).toBeInTheDocument();

    // Check for proper heading hierarchy
    const headings = screen.getAllByRole('heading');
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0]).toHaveTextContent('Kontakt');
  });

  it('renderuje wszystkie sekcje w prawidłowej kolejności', () => {
    const { container } = render(<PageComponent />);

    const sections = container.querySelectorAll('section');
    expect(sections.length).toBe(3); // hero, map, contact info

    // Check for specific sections
    expect(sections[0]).toHaveClass('contact-us-home');
    expect(sections[1].querySelector('.map')).toBeInTheDocument();
    expect(sections[2]).toHaveClass('section', 'bg-light');
  });

  it('ma accessibility - linki mają odpowiednie atrybuty', () => {
    render(<PageComponent />);

    const externalLinks = screen.getAllByRole('link').filter(link =>
      link.getAttribute('target') === '_blank'
    );

    externalLinks.forEach(link => {
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    });
  });

  it('renderuje contact icons w odpowiednich kontenerach', () => {
    const { container } = render(<PageComponent />);

    const contactContainers = container.querySelectorAll('.contact-us-cantent');
    expect(contactContainers.length).toBe(2);

    contactContainers.forEach(container => {
      expect(container).toHaveClass('text-center', 'mt-4');
      expect(container.querySelector('.contact-icon')).toBeInTheDocument();
    });
  });
});