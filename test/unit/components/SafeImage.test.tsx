import { render, screen } from '@testing-library/react';
import SafeImage, { type SafeImageProps } from '@/components/SafeImage';

describe('SafeImage', () => {
  it('renders the supplied source, accessible alternative text, and literal dimensions through Next Image', () => {
    render(<SafeImage src="/images/example.png" alt="Example" width={80} height={60} />);

    const image = screen.getByRole('img', { name: 'Example' });
    expect(image).toHaveAttribute('src', '/images/example.png');
    expect(image).toHaveAttribute('alt', 'Example');
    expect(image).toHaveAttribute('width', '80');
    expect(image).toHaveAttribute('height', '60');
    expect(image).toHaveAttribute('data-next-image', 'true');
    expect(image).toHaveAttribute('data-next-image-unoptimized', 'true');
  });

  it('forwards standard image attributes', () => {
    render(
      <SafeImage
        src="/test.jpg"
        alt="Test"
        className="custom-class"
        width={100}
        height={50}
        data-testid="custom-image"
      />,
    );

    const image = screen.getByRole('img', { name: 'Test' });
    expect(image).toHaveClass('custom-class');
    expect(image).toHaveAttribute('width', '100');
    expect(image).toHaveAttribute('height', '50');
    expect(image).toHaveAttribute('data-testid', 'custom-image');
  });

  it('defaults alternative text to empty at the invalid runtime boundary', () => {
    const props = {
      src: '/test.jpg',
      width: 80,
      height: 60,
    } as unknown as SafeImageProps;

    render(<SafeImage {...props} />);

    expect(screen.getByAltText('')).toHaveAttribute('src', '/test.jpg');
  });

  it('normalizes an invalid source boundary to a string', () => {
    render(<SafeImage src={123 as unknown as string} alt="Test" width={80} height={60} />);

    expect(screen.getByRole('img', { name: 'Test' })).toHaveAttribute('src', '123');
  });

  it('rejects unpaired dimensions unless fill is selected', () => {
    const props = {
      src: '/test.jpg',
      alt: 'Unpaired dimensions',
      width: 80,
    } as SafeImageProps;

    expect(() => render(<SafeImage {...props} />)).toThrow(
      'NextImageMock requires paired valid width and height unless fill is true',
    );
  });

  it('allows fill images without dimensions', () => {
    render(<SafeImage src="/test.jpg" alt="Fill image" fill />);

    expect(screen.getByRole('img', { name: 'Fill image' })).toHaveAttribute(
      'data-next-image-unoptimized',
      'true',
    );
  });
});
