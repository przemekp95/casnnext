import { replacePlaceholders } from '@/lib/cms/placeholders';

describe('replacePlaceholders', () => {
  it('podstawia pojedynczy placeholder', () => {
    const out = replacePlaceholders('Witaj, {{ user }}!', { user: 'Jan' });
    expect(out).toBe('Witaj, Jan!');
  });

  it('zostawia nieznane placeholdery bez zmian', () => {
    const out = replacePlaceholders('Cześć {{ x }} i {{ y }}', { x: 'A' });
    expect(out).toBe('Cześć A i {{ y }}');
  });

  it('wspiera wiele wystąpień tego samego klucza', () => {
    const out = replacePlaceholders('{{a}} {{a}}', { a: 'X' });
    expect(out).toBe('X X');
  });

  it('zwraca pusty string dla undefined', () => {
    const out = replacePlaceholders(undefined, { a: 'X' });
    expect(out).toBe('');
  });
});
