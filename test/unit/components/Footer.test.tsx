import { render, screen } from '@testing-library/react';
import Footer from '@/components/Footer';

describe('Footer', () => {
  it('renders the organization and social destinations', () => {
    render(<Footer />);

    expect(screen.getByRole('link', { name: 'Centrum Analiz Służby Niepodległej CASN logo' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'CASN na Facebooku' })).toHaveAttribute(
      'href',
      'https://www.facebook.com/100094527270878',
    );
    expect(screen.getByRole('link', { name: 'CASN na Twitterze' })).toHaveAttribute(
      'href',
      'https://twitter.com/fundacjasluzba',
    );
    expect(screen.getByRole('link', { name: 'CASN na Instagramie' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/fundacja_sluzba_niepodleglej/',
    );
    expect(screen.getByRole('link', { name: 'Wesprzyj nas' })).toHaveAttribute(
      'href',
      'https://sluzbaniepodleglej.pl/wspomoz-nas/',
    );
  });
});
