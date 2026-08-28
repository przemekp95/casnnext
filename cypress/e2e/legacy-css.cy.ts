const legacyStylesheetUrls = [
  '/css/legacy/bootstrap.min.css',
  '/css/legacy/style.css',
  '/css/legacy/menu.css',
  '/css/legacy/owl.carousel.css',
  '/css/legacy/owl.theme.css',
  '/css/legacy/owl.transitions.css',
  '/css/legacy/themify-icons.css',
  '/css/legacy/magnific-popup.css',
] as const;

describe('Legacy CSS ownership', () => {
  it('serves the ordered legacy styles and preserves their visible contracts', () => {
    legacyStylesheetUrls.forEach((url) => {
      cy.request(url).its('status').should('eq', 200);
    });

    cy.visit('/');

    cy.get('body').should('have.css', 'font-family', 'Roboto, sans-serif');
    cy.get('#topnav')
      .should('be.visible')
      .find('.navigation-menu > li > a')
      .first()
      .should('have.css', 'color', 'rgb(255, 255, 255)');
    cy.get('.row').first().should('have.css', 'display', 'flex');
    cy.get('.btn-custom')
      .first()
      .should('have.css', 'background-color', 'rgb(208, 0, 0)')
      .and('have.css', 'color', 'rgb(255, 255, 255)');
  });
});
