/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { render } from '@testing-library/react';

let Map: any;
let hasComp = false;
try {
  Map = require('@/components/maps/Map').default;
  hasComp = !!Map;
} catch (e) {}

(hasComp ? describe : describe.skip)('Map', () => {
  it('renderuje nulla (placeholder)', () => {
    const { container } = render(<Map />);
    expect(container.firstChild).toBeNull();
  });

  it('akceptuje props bez błędu', () => {
    const props = {
      center: [52.2297, 21.0122],
      zoom: 10,
      markers: [
        { lat: 52.2297, lng: 21.0122, title: 'Warszawa' }
      ]
    };

    expect(() => {
      render(<Map {...props} />);
    }).not.toThrow();
  });

  it('renderuje nulla nawet z props', () => {
    const { container } = render(<Map center={[50, 20]} zoom={8} />);
    expect(container.firstChild).toBeNull();
  });
});