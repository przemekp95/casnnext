import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

    expect(container.querySelector('.hero-contrast-overlay')).toHaveStyle({
      background: 'linear-gradient(180deg, rgba(10, 10, 12, 0.52) 0%, rgba(10, 10, 12, 0.72) 100%)',
      opacity: '1',
    });
    expect(screen.getByRole('heading', { name: 'Nasi autorzy' }).closest('.hero-content-panel'))
      .toHaveStyle({ background: 'rgba(18, 18, 20, 0.76)' });
    const currentBreadcrumb = screen.getByText('Nasi autorzy', { selector: '.hero-breadcrumb-current' });
    expect(currentBreadcrumb).toHaveClass('text-custom');
    expect(currentBreadcrumb.closest('[aria-current="page"]')).toHaveClass('hero-breadcrumb-active');
  });

  it('preserves the original solid-black 50% overlay for the background-only homepage hero', () => {
    const { container } = render(
      <Hero title="" variant="background-only" showBreadcrumbs={false} />
    );

    expect(container.querySelector('.bg-overlay')).toHaveStyle({
      backgroundColor: '#000',
      opacity: '0.5',
    });
    expect(container.querySelector('.hero-contrast-overlay')).not.toBeInTheDocument();
    expect(container.querySelector('.hero-content-panel')).not.toBeInTheDocument();
  });

  it('keeps the contrast colors and responsive opacity in the legacy stylesheet', () => {
    const css = readFileSync(join(process.cwd(), 'public/css/legacy/style.css'), 'utf8');
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    const legacyCss = readFileSync(join(process.cwd(), 'app/legacy.css'), 'utf8');

    expect(css).toMatch(/\.topnav-bg\s*{[^}]*background:\s*#242426;/s);
    expect(css).toMatch(/\.contact-us-home \.hero-contrast-overlay\s*{[^}]*rgba\(10, 10, 12, 0\.72\)[^}]*opacity:\s*1;/s);
    expect(css).toMatch(/\.hero-content-panel\s*{[^}]*rgba\(18, 18, 20, 0\.76\)/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.hero-content-panel\s*{[^}]*rgba\(18, 18, 20, 0\.82\)/s);
    const globalsImportIndex = layout.indexOf('import "./globals.css";');
    const legacyImportIndex = layout.indexOf('import "./legacy.css";');

    expect(globalsImportIndex).toBeGreaterThanOrEqual(0);
    expect(legacyImportIndex).toBeGreaterThanOrEqual(0);
    expect(globalsImportIndex).toBeLessThan(legacyImportIndex);
    expect(legacyCss.match(/^@import url\([^\n]+\);$/gm)).toEqual([
      '@import url("../public/css/legacy/bootstrap.min.css");',
      '@import url("../public/css/legacy/style.css?v=20260826-hero-contrast");',
      '@import url("../public/css/legacy/menu.css");',
      '@import url("../public/css/legacy/owl.carousel.css");',
      '@import url("../public/css/legacy/owl.theme.css");',
      '@import url("../public/css/legacy/owl.transitions.css");',
      '@import url("../public/css/legacy/themify-icons.css");',
      '@import url("../public/css/legacy/magnific-popup.css");',
    ]);
  });
});
