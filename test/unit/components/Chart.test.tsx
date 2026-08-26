import { render } from '@testing-library/react';
import Chart from '@/components/charts/Chart';

describe('Chart', () => {
  it('renders the explicit empty fallback until chart output is implemented', () => {
    const { container } = render(<Chart />);

    expect(container).toBeEmptyDOMElement();
  });
});
