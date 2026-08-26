import { render } from '@testing-library/react';
import Map from '@/components/maps/Map';

describe('Map', () => {
  it('renders the explicit empty fallback until map output is implemented', () => {
    const { container } = render(<Map />);

    expect(container).toBeEmptyDOMElement();
  });
});
