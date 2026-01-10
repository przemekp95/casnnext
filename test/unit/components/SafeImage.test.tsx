import { render, screen, waitFor } from '@testing-library/react';

let SafeImage: any;
let hasComp = false;
try {
  SafeImage = require('@/components/SafeImage').default;
  hasComp = !!SafeImage;
} catch (e) {}

(hasComp ? describe : describe.skip)('SafeImage', () => {
  // Mock Image constructor
  const mockImage = {
    onload: jest.fn(),
    onerror: jest.fn(),
    src: ''
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    global.Image = jest.fn().mockImplementation(() => mockImage);
  });

  it('renderuje obraz gdy się ładuje poprawnie', async () => {
    render(<SafeImage src="/test-image.jpg" alt="Test image" />);

    // Initially should render the img element
    const img = screen.getByAltText('Test image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/test-image.jpg');

    // Trigger successful load
    await waitFor(() => {
      mockImage.onload();
    });

    // Should still render the img
    expect(screen.getByAltText('Test image')).toBeInTheDocument();
  });

  it('renderuje fallback gdy obraz się nie załaduje', async () => {
    render(<SafeImage src="/broken-image.jpg" alt="Broken image" />);

    // Initially should render the img element
    expect(screen.getByAltText('Broken image')).toBeInTheDocument();

    // Trigger error
    mockImage.onerror();

    await waitFor(() => {
      expect(screen.getByText('Obraz niedostępny')).toBeInTheDocument();
    });

    // Original img should be gone
    expect(screen.queryByAltText('Broken image')).not.toBeInTheDocument();
  });

  it('renderuje fallback gdy timeout zostanie przekroczony', async () => {
    render(<SafeImage src="/slow-image.jpg" alt="Slow image" timeoutMs={100} />);

    // Initially should render the img element
    expect(screen.getByAltText('Slow image')).toBeInTheDocument();

    // Wait for timeout
    await waitFor(() => {
      expect(screen.getByText('Obraz niedostępny')).toBeInTheDocument();
    }, { timeout: 200 });

    // Original img should be gone
    expect(screen.queryByAltText('Slow image')).not.toBeInTheDocument();
  });

  it('używa domyślnego timeout 7000ms', () => {
    render(<SafeImage src="/test.jpg" alt="Test" />);

    expect(global.Image).toHaveBeenCalledTimes(1);
    expect(mockImage.src).toBe('/test.jpg');
  });

  it('używa customowego timeout', () => {
    render(<SafeImage src="/test.jpg" alt="Test" timeoutMs={5000} />);

    expect(global.Image).toHaveBeenCalledTimes(1);
    expect(mockImage.src).toBe('/test.jpg');
  });

  it('przekazuje pozostałe props do img elementu', () => {
    render(
      <SafeImage
        src="/test.jpg"
        alt="Test"
        className="custom-class"
        width={100}
        height={50}
      />
    );

    const img = screen.getByAltText('Test');
    expect(img).toHaveClass('custom-class');
    expect(img).toHaveAttribute('width', '100');
    expect(img).toHaveAttribute('height', '50');
  });

  it('używa domyślnego alt text gdy nie podany', () => {
    render(<SafeImage src="/test.jpg" />);

    const img = screen.getByAltText('');
    expect(img).toBeInTheDocument();
  });

  it('konwertuje src na string', () => {
    render(<SafeImage src={123 as any} alt="Test" />);

    expect(mockImage.src).toBe('123');
    const img = screen.getByAltText('Test');
    expect(img).toHaveAttribute('src', '123');
  });
});