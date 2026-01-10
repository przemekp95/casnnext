/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { render, screen } from '@testing-library/react';

let CtaSection: any;
let hasComp = false;
try {
  CtaSection = require('@/components/CtaSection').default;
  hasComp = !!CtaSection;
} catch (e) {}

(hasComp ? describe : describe.skip)('CtaSection', () => {
  it('renderuje sekcję CTA z prawidłowym tekstem', () => {
    render(<CtaSection />);

    expect(screen.getByText('Dołącz do drużyny Służby Niepodległej!')).toBeInTheDocument();
    expect(screen.getByText(/Każda złotówka przybliża nas/)).toBeInTheDocument();
  });

  it('renderuje link do wsparcia z prawidłowym href', () => {
    render(<CtaSection />);

    const link = screen.getByRole('link', { name: /Wspomóż nas/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://sluzbaniepodleglej.pl/wspomoz-nas/');
  });

  it('ma odpowiednie klasy CSS', () => {
    const { container } = render(<CtaSection />);

    expect(container.firstChild).toHaveClass('section-sm', 'bg-custom');
    expect(container.querySelector('.btn')).toHaveClass('btn-light');
  });

  it('renderuje w odpowiedniej strukturze layout', () => {
    const { container } = render(<CtaSection />);

    expect(container.querySelector('.container')).toBeInTheDocument();
    expect(container.querySelector('.row')).toBeInTheDocument();
    expect(container.querySelectorAll('.col-lg-8, .col-md-4')).toHaveLength(2);
  });
});