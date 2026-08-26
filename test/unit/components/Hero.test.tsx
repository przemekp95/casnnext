import { render, screen } from '@testing-library/react';

import Hero from '@/components/Hero';

describe('Hero', () => {
  it('keeps page-header text on dedicated high-contrast layers', () => {
    const { container } = render(
      <Hero
        title="Nasi autorzy"
        breadcrumbs={[
          { label: 'Strona główna', href: '/' },
          { label: 'Nasi autorzy', active: true },
        ]}
      />
    );

    expect(container.querySelector('.hero-contrast-overlay')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nasi autorzy' }).closest('.hero-content-panel'))
      .toBeInTheDocument();
    expect(screen.getByText('Nasi autorzy', { selector: '.hero-breadcrumb-current' })
      .closest('[aria-current="page"]'))
      .toHaveClass('hero-breadcrumb-active');
  });
});
