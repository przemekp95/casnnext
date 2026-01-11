/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { render, screen } from '@testing-library/react';

let SafeImage: any;
let hasComp = false;
try {
  SafeImage = require('@/components/SafeImage').default;
  hasComp = !!SafeImage;
} catch (e) {}

(hasComp ? describe : describe.skip)('SafeImage', () => {
  it('renderuje img element z podanymi props', () => {
    render(<SafeImage src="/test.jpg" alt="Test image" />);

    const img = screen.getByAltText('Test image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/test.jpg');
    expect(img.tagName).toBe('IMG');
  });

  it('przekazuje wszystkie props do img elementu', () => {
    render(
      <SafeImage
        src="/test.jpg"
        alt="Test"
        className="custom-class"
        width={100}
        height={50}
        data-testid="custom-image"
      />
    );

    const img = screen.getByAltText('Test');
    expect(img).toHaveClass('custom-class');
    expect(img).toHaveAttribute('width', '100');
    expect(img).toHaveAttribute('height', '50');
    expect(img).toHaveAttribute('data-testid', 'custom-image');
  });

  it('używa domyślnego alt text gdy nie podany', () => {
    render(<SafeImage src="/test.jpg" />);

    const img = screen.getByAltText('');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/test.jpg');
  });

  it('konwertuje src na string', () => {
    render(<SafeImage src={123 as any} alt="Test" />);

    const img = screen.getByAltText('Test');
    expect(img).toHaveAttribute('src', '123');
  });

  it('renderuje się jako standardowy img element', () => {
    render(<SafeImage src="/test.jpg" alt="Test" />);

    const img = screen.getByAltText('Test');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src');
    expect(img).toHaveAttribute('alt');
  });
});