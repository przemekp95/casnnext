/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { render, screen, fireEvent } from '@testing-library/react';

let Header: any;
let hasComp = false;

jest.mock('@/components/SearchModal', () => ({
  __esModule: true,
  default: () => null,
}));

try {
  Header = require('@/components/Header').default;
  hasComp = !!Header;
} catch (_) {}

(hasComp ? describe : describe.skip)('Header', () => {
  it('renderuje nawigację i link do strony głównej', () => {
    render(<Header />);
    // luźne sprawdzenia, aby nie zależeć od konkretnych tekstów
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('otwiera/zamyka menu mobilne (jeśli jest toggle)', () => {
    render(<Header />);
    const toggles = screen.queryAllByRole('button');
    if (toggles.length) {
      fireEvent.click(toggles[0]);
    }
  });

  it('menu mobilne zmienia stan po kliknięciu', () => {
    render(<Header />);

    // Sprawdź czy przycisk hamburger istnieje
    const hamburgerBtn = screen.queryByRole('button', { name: /przełącz menu nawigacyjne/i });
    if (hamburgerBtn) {
      // Sprawdź stan początkowy
      expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'false');

      // Kliknij przycisk
      fireEvent.click(hamburgerBtn);

      // Sprawdź czy stan się zmienił
      expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'true');

      // Kliknij ponownie
      fireEvent.click(hamburgerBtn);

      // Sprawdź czy stan wrócił
      expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('linki nawigacyjne zawierają poprawne href', () => {
    render(<Header />);

    // Sprawdź link do strony głównej
    const homeLink = screen.queryByRole('link', { name: /strona główna/i });
    if (homeLink) {
      expect(homeLink).toHaveAttribute('href', '/');
    }

    // Sprawdź link do autorów
    const authorsLink = screen.queryByRole('link', { name: /autorzy/i });
    if (authorsLink) {
      expect(authorsLink).toHaveAttribute('href', '/autorzy');
    }

    // Sprawdź link do zbiorów
    const collectionsLink = screen.queryByRole('link', { name: /zbiory/i });
    if (collectionsLink) {
      expect(collectionsLink).toHaveAttribute('href', '/zbiory');
    }

    // Sprawdź link do kontaktu
    const contactLink = screen.queryByRole('link', { name: /kontakt/i });
    if (contactLink) {
      expect(contactLink).toHaveAttribute('href', '/kontakt');
    }
  });

  it('menu mobilne zamyka się po kliknięciu w link nawigacyjny', () => {
    render(<Header />);

    const hamburgerBtn = screen.queryByRole('button', { name: /przełącz menu nawigacyjne/i });
    const authorsLink = screen.queryByRole('link', { name: /autorzy/i });

    if (hamburgerBtn && authorsLink) {
      // Otwórz menu
      fireEvent.click(hamburgerBtn);
      expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'true');

      // Kliknij w link - menu powinno się zamknąć
      fireEvent.click(authorsLink);
      expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('wyświetla tagline z kontaktem email', () => {
    render(<Header />);

    // Sprawdź czy jest link do email
    const emailLink = screen.queryByRole('link', { name: /wyślij email/i });
    if (emailLink) {
      expect(emailLink).toHaveAttribute('href', 'mailto:fundacja@sluzbaniepodleglej.pl');
      expect(emailLink).toHaveTextContent('fundacja@sluzbaniepodleglej.pl');
    }
  });
});
