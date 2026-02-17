import { act, render } from '@testing-library/react';
import { MdiShim } from '@/app/ui/icons/MdiShim';

describe('MdiShim', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('replaces known mdi icons with inline svg wrappers', () => {
    document.body.innerHTML = '<div><i class="mdi mdi-email custom" data-test="value"></i></div>';

    render(<MdiShim />);
    act(() => {
      jest.advanceTimersByTime(120);
    });

    const replaced = document.querySelector('span.mdi-email.custom');
    expect(replaced).toBeInTheDocument();
    expect(replaced?.getAttribute('data-test')).toBe('value');
    expect(replaced?.querySelector('svg')).toBeInTheDocument();
    expect(document.querySelector('i.mdi')).not.toBeInTheDocument();
  });

  it('does not replace unknown icons or entries marked as already replaced', () => {
    document.body.innerHTML = [
      '<div>',
      '<i class="mdi mdi-unknown"></i>',
      '<i class="mdi mdi-email" data-replaced="1"></i>',
      '</div>',
    ].join('');

    render(<MdiShim />);
    act(() => {
      jest.advanceTimersByTime(120);
    });

    expect(document.querySelector('i.mdi-unknown')).toBeInTheDocument();
    expect(document.querySelector('i[data-replaced="1"]')).toBeInTheDocument();
  });

  it('suppresses mdi hydration warnings and restores console.error on cleanup', () => {
    const originalConsoleError = console.error;
    const baseLogger = jest.fn();
    console.error = baseLogger;

    const { unmount } = render(<MdiShim />);

    console.error('Hydration failed due to mdi mismatch');
    console.error('Regular runtime error');

    expect(baseLogger).toHaveBeenCalledTimes(1);
    expect(baseLogger).toHaveBeenCalledWith('Regular runtime error');

    unmount();
    expect(console.error).toBe(baseLogger);

    console.error = originalConsoleError;
  });

  it('replaces mdi icons added after mount via mutation observer', () => {
    render(<MdiShim />);

    const container = document.createElement('div');
    container.innerHTML = '<i class="mdi mdi-email dynamic"></i>';
    document.body.appendChild(container);

    act(() => {
      jest.advanceTimersByTime(0);
      jest.advanceTimersByTime(120);
    });

    expect(document.querySelector('span.dynamic.mdi-email')).toBeInTheDocument();
    expect(container.querySelector('i.mdi')).not.toBeInTheDocument();
  });
});
