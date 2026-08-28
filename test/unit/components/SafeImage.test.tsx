import { render, screen } from '@testing-library/react';
import SafeImage from '@/components/SafeImage';

describe('SafeImage', () => {
  it('renders the supplied source, accessible alternative text, and literal dimensions through Next Image', () => {
    render(<SafeImage src="/images/example.png" alt="Example" width={80} height={60} />);

    const image = screen.getByRole('img', { name: 'Example' });
    expect(image).toHaveAttribute('src', '/images/example.png');
    expect(image).toHaveAttribute('alt', 'Example');
    expect(image).toHaveAttribute('width', '80');
    expect(image).toHaveAttribute('height', '60');
    expect(image).toHaveAttribute('data-next-image', 'true');
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

  it('defaults alternative text to empty when it is not supplied', () => {
    render(<SafeImage src="/test.jpg" />);

    expect(screen.getByAltText('')).toHaveAttribute('src', '/test.jpg');
  });

  it('normalizes an invalid source boundary to a string', () => {
    render(<SafeImage src={123 as unknown as string} alt="Test" />);

    expect(screen.getByRole('img', { name: 'Test' })).toHaveAttribute('src', '123');
  });
});
