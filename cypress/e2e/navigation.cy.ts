describe('Nawigacja', () => {
  it('Strona główna odpowiada i ma podstawowe treści', () => {
    // Ustaw viewport na mobile od razu
    cy.viewport('iphone-6');

    cy.visit('/');
    cy.contains(/CASN|Centrum Analiz|Analizy/i);
    // spróbuj znaleźć link do analiz, ale nie wymagaj go
    cy.get('a').then($a => {
      const el = [...$a].find(a => /Analiz/.test(a.textContent || ''));
      if (el) cy.wrap(el).click();
    });
  });

  it('Menu mobilne - hamburger menu działa poprawnie', () => {
    // Ustaw viewport na mobile
    cy.viewport('iphone-6');

    cy.visit('/');

    // Sprawdź czy hamburger menu istnieje i jest widoczne
    cy.get('.navbar-toggle').should('be.visible');
    cy.get('.navbar-toggle .lines').should('be.visible');

    // Sprawdź czy nawigacja jest początkowo ukryta na mobile
    cy.get('#navigation').should('not.be.visible');

    // Kliknij w hamburger menu
    cy.get('.navbar-toggle').click();

    // Sprawdź czy nawigacja się pojawiła
    cy.get('#navigation').should('be.visible');

    // Sprawdź czy ikona hamburgera ma klasę 'open' (animacja)
    cy.get('.navbar-toggle .lines').should('have.class', 'open');

    // Kliknij ponownie w hamburger menu
    cy.get('.navbar-toggle').click();

    // Sprawdź czy nawigacja się ukryła
    cy.get('#navigation').should('not.be.visible');

    // Sprawdź czy ikona hamburgera nie ma klasy 'open'
    cy.get('.navbar-toggle .lines').should('not.have.class', 'open');
  });

  it('Menu mobilne - zamyka się po kliknięciu w link', () => {
    cy.viewport('iphone-6');

    cy.visit('/');

    // Otwórz menu
    cy.get('.navbar-toggle').click();
    cy.get('#navigation').should('be.visible');

    // Kliknij w link
    cy.get('#navigation a').first().click();

    // Sprawdź czy menu się zamknęło
    cy.get('#navigation').should('not.be.visible');
    cy.get('.navbar-toggle .lines').should('not.have.class', 'open');
  });

  it('Menu mobilne - zamyka się po kliknięciu poza menu', () => {
    cy.viewport('iphone-6');

    cy.visit('/');

    // Otwórz menu
    cy.get('.navbar-toggle').click();
    cy.get('#navigation').should('be.visible');

    // Kliknij poza menu (np. w body)
    cy.get('body').click(0, 0);

    // Sprawdź czy menu się zamknęło
    cy.get('#navigation').should('not.be.visible');
    cy.get('.navbar-toggle .lines').should('not.have.class', 'open');
  });
});
