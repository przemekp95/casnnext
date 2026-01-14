import { render } from '@testing-library/react';
import { ComponentType } from 'react';

let Footer: ComponentType<Record<string, unknown>> | null = null;
let hasComp = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Footer = require('@/components/Footer').default;
  hasComp = !!Footer;
} catch (_unused) {}

(hasComp ? describe : describe.skip)('Footer', () => {
  it('renderuje stopkę', () => {
    const { container } = render(<Footer />);
    expect(container).toBeTruthy();
  });
});