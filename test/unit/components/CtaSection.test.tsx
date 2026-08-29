import { render, screen } from '@testing-library/react';
import CtaSection from '@/components/CtaSection';

describe('CtaSection', () => {
  it('renders the support message and its destination', () => {
    render(<CtaSection />);

    expect(screen.getByRole('heading', { level: 4, name: 'Dołącz do drużyny Służby Niepodległej!' })).toBeInTheDocument();
    expect(screen.getByText('Każda złotówka przybliża nas do wydania kolejnych analiz.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wspomóż nas' })).toHaveAttribute(
      'href',
      'https://sluzbaniepodleglej.pl/wspomoz-nas/',
    );
  });
});
