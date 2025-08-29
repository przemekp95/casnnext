describe('Nawigacja', () => {
  it('Strona główna odpowiada i ma podstawowe treści', () => {
    cy.visit('/');
    cy.contains(/CASN|Centrum Analiz|Analizy/i);
    // spróbuj znaleźć link do analiz, ale nie wymagaj go
    cy.get('a').then($a => {
      const el = [...$a].find(a => /Analiz/.test(a.textContent || ''));
      if (el) cy.wrap(el).click();
    });
  });
});
