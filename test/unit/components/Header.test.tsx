import { fireEvent, render, screen } from '@testing-library/react';
import Header from '@/components/Header';

jest.mock('@/components/SearchModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('Header', () => {
  it('renders the main navigation destinations', () => {
    render(<Header />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menu główne' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Autorzy' })).toHaveAttribute('href', '/autorzy');
    expect(screen.getByRole('link', { name: 'Analizy' })).toHaveAttribute('href', '/analizy');
    expect(screen.getByRole('link', { name: 'Zbiory analiz' })).toHaveAttribute('href', '/zbiory');
    expect(screen.getByRole('link', { name: 'Kontakt' })).toHaveAttribute('href', '/kontakt');
  });

  it('toggles and closes the mobile navigation menu through required controls', () => {
    render(<Header />);

    const button = screen.getByRole('button', { name: /przełącz menu nawigacyjne/i });
    const authorsLink = screen.getByRole('link', { name: 'Autorzy' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(authorsLink);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the contact email destination', () => {
    render(<Header />);

    expect(screen.getByRole('link', { name: /wyślij email/i })).toHaveAttribute(
      'href',
      'mailto:fundacja@sluzbaniepodleglej.pl',
    );
  });
});
