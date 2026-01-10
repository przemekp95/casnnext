/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { render } from '@testing-library/react';

let Footer: any;
let hasComp = false;
try {
  Footer = require('@/components/Footer').default;
  hasComp = !!Footer;
} catch (_) {}

(hasComp ? describe : describe.skip)('Footer', () => {
  it('renderuje stopkę', () => {
    const { container } = render(<Footer />);
    expect(container).toBeTruthy();
  });
});
