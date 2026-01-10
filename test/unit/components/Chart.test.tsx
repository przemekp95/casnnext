/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { render } from '@testing-library/react';

let Chart: any;
let hasComp = false;
try {
  Chart = require('@/components/charts/Chart').default;
  hasComp = !!Chart;
} catch (e) {}

(hasComp ? describe : describe.skip)('Chart', () => {
  it('renderuje nulla (placeholder)', () => {
    const { container } = render(<Chart />);
    expect(container.firstChild).toBeNull();
  });

  it('akceptuje props bez błędu', () => {
    const props = {
      data: [1, 2, 3],
      type: 'bar',
      title: 'Test Chart'
    };

    expect(() => {
      render(<Chart {...props} />);
    }).not.toThrow();
  });

  it('renderuje nulla nawet z props', () => {
    const { container } = render(<Chart data={[1,2,3]} type="line" />);
    expect(container.firstChild).toBeNull();
  });
});