import { render, screen, within } from '@testing-library/react';
import KontaktPage from '@/app/kontakt/page';

describe('Kontakt Page', () => {
  it('renderuje stronę kontaktową z hero sekcją', () => {
    render(<KontaktPage />);

    expect(screen.getByRole('heading', { name: 'Kontakt' })).toBeInTheDocument();

    // Check for hero section
    const heroSection = screen.getByRole('main').querySelector('section');
    expect(heroSection).toBeInTheDocument();
  });

  it('renderuje breadcrumb navigation', () => {
    render(<KontaktPage />);

    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(breadcrumb).getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
    expect(within(breadcrumb).getByText('Kontakt')).toBeInTheDocument();
  });

  it('renderuje mapę Google z prawidłowym iframe', () => {
    render(<KontaktPage />);

    const iframe = screen.getByTitle('Mapa dojazdu');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', expect.stringContaining('google.com/maps'));
    expect(iframe).toHaveAttribute('src', expect.stringContaining('Konduktorska'));
    expect(iframe).toHaveAttribute('width', '100%');
    expect(iframe).toHaveAttribute('height', '500');
  });

  it('renderuje informacje kontaktowe - email', () => {
    render(<KontaktPage />);

    const emailLink = screen.getByRole('link', { name: /fundacja@sluzbaniepodleglej\.pl/ });
    expect(emailLink).toBeInTheDocument();
    expect(emailLink).toHaveAttribute('href', 'mailto:fundacja@sluzbaniepodleglej.pl');
  });

  it('renderuje informacje kontaktowe - strona www', () => {
    render(<KontaktPage />);

    const websiteLink = screen.getByRole('link', { name: 'sluzbaniepodleglej.pl' });
    expect(websiteLink).toBeInTheDocument();
    expect(websiteLink).toHaveAttribute('href', 'https://sluzbaniepodleglej.pl');
    expect(websiteLink).toHaveAttribute('target', '_blank');
    expect(websiteLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renderuje adres fizyczny', () => {
    render(<KontaktPage />);

    expect(screen.getByText('Centrum Konferencyjno-Szkoleniowe')).toBeInTheDocument();
    expect(screen.getByText('ul. Konduktorska 3/2, 00-775 Warszawa')).toBeInTheDocument();
  });

  it('renderuje ikony kontaktowe', () => {
    const { container } = render(<KontaktPage />);

    const icons = container.querySelectorAll('.mdi-email-outline, .mdi-web');
    expect(icons.length).toBe(2);
  });

  it('renderuje responsywny layout z col-md-* klasami', () => {
    const { container } = render(<KontaktPage />);

    expect(container.querySelector('.col-md-4')).toBeInTheDocument();
    expect(container.querySelector('.col-md-5')).toBeInTheDocument();
  });

  it('renderuje odpowiednie obrazy hero', () => {
    const { container } = render(<KontaktPage />);

    const heroPicture = container.querySelector('.hero-picture');
    const desktopHero = heroPicture?.querySelector('img');
    const mobileHero = heroPicture?.querySelector('source');

    expect(heroPicture).toBeInTheDocument();
    expect(desktopHero).toHaveAttribute('src', '/images/home2.webp');
    expect(desktopHero).toHaveAttribute('alt', '');
    expect(mobileHero).toHaveAttribute('srcset', '/images/logo.jpg');
  });

  it('ma odpowiednie klasy CSS dla sekcji', () => {
    const { container } = render(<KontaktPage />);

    expect(container.querySelector('.section')).toBeInTheDocument();
    expect(container.querySelector('[class*="bg-"]')).toBeInTheDocument();
    expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
  });

  it('renderuje strukturę semantic HTML', () => {
    render(<KontaktPage />);

    expect(screen.getByRole('main')).toBeInTheDocument();

    // Check for proper heading hierarchy
    const headings = screen.getAllByRole('heading');
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0]).toHaveTextContent('Kontakt');
  });

  it('renderuje wszystkie sekcje w prawidłowej kolejności', () => {
    const { container } = render(<KontaktPage />);

    const sections = container.querySelectorAll('section');
    expect(sections.length).toBe(4); // hero, map, contact info, address

    // Check for specific sections
    expect(sections[0]).toHaveClass('section');
    expect(sections[1].querySelector('.map')).toBeInTheDocument();
    expect(sections[2]).toHaveClass('section', 'bg-light');
    expect(sections[3]).toHaveClass('section');
  });

  it('ma accessibility - linki mają odpowiednie atrybuty', () => {
    render(<KontaktPage />);

    const externalLinks = screen.getAllByRole('link').filter(link =>
      link.getAttribute('target') === '_blank'
    );

    externalLinks.forEach(link => {
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    });
  });

  it('renderuje contact icons w odpowiednich kontenerach', () => {
    const { container } = render(<KontaktPage />);

    const contactContainers = container.querySelectorAll('.contact-us-cantent');
    expect(contactContainers.length).toBe(2);

    contactContainers.forEach(container => {
      expect(container).toHaveClass('text-center', 'mt-4');
      expect(container.querySelector('.contact-icon')).toBeInTheDocument();
    });
  });
});
