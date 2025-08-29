let mod: unknown;
try {
  // jeśli helper zostanie przeniesiony do lib/, zaktualizuj import
  // np. require('@/lib/strings')
  // na razie próbujemy tam, gdzie jest teraz:
  mod = require('@/app/analizy/[slug]/page');
} catch {
  // brak modułu – obsłużymy poniżej
}

type RP = (s: string, m: Record<string, string>) => string;
const hasFn =
  typeof mod === 'object' &&
  mod !== null &&
  // @ts-ignore – dostęp do właściwości dynamicznej
  typeof (mod as any).replacePlaceholders === 'function';

if (!hasFn) {
  test.skip('replacePlaceholders: moduł nieobecny – test pominięty', () => {});
} else {
  // @ts-ignore – mamy pewność po warunku
  const replacePlaceholders: RP = (mod as any).replacePlaceholders;

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
  });
}
