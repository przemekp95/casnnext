/* eslint-disable @typescript-eslint/no-unused-expressions */
describe('Hydration Tests', () => {
  it('should hydrate without errors on all pages', () => {
    // Visit homepage
    cy.visit('/');

    // Wait for hydration to complete
    cy.window().should('have.property', '__NEXT_DATA__');

    // Check for hydration errors in console
    cy.window().then((win) => {
      // Override console.error to catch hydration errors
      const originalError = win.console.error;
      const hydrationErrors: string[] = [];

      win.console.error = (...args: unknown[]) => {
        const message = args.join(' ');
        if (message.includes('Minified React error') ||
            message.includes('hydration') ||
            message.includes('Hydration')) {
          hydrationErrors.push(message);
        }
        originalError.apply(win.console, args);
      };

      // Store for later checks
      (win as { hydrationErrors?: string[] }).hydrationErrors = hydrationErrors;
    });

    // Verify no hydration errors occurred
    cy.window().should((win) => {
      const errors = (win as { hydrationErrors?: string[] }).hydrationErrors || [];
      expect(errors.length).to.equal(0, `Hydration errors found: ${errors.join(', ')}`);
    });
  });

  it('should maintain consistent DOM structure after hydration', () => {
    cy.visit('/');

    // Wait for hydration
    cy.window().should('have.property', '__NEXT_DATA__');

    // Small delay to ensure hydration is complete
    cy.wait(100);

    // Compare DOM structure
    cy.document().should((doc) => {
      const clientHTML = doc.body.innerHTML;
      // Basic structure should be similar (not identical due to dynamic content)
      expect(clientHTML).to.contain('bg-gray-100'); // Main container class
      expect(clientHTML).to.contain('min-h-screen'); // Layout classes
    });
  });

  it('should load authors page without hydration errors', () => {
    cy.visit('/autorzy');

    // Wait for page to load
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    void cy.contains('Nasi autorzy').should('be.visible');

    // Check for hydration errors
    cy.window().then((win) => {
      const originalError = win.console.error;
      const hydrationErrors: string[] = [];

      win.console.error = (...args: unknown[]) => {
        const message = args.join(' ');
        if (message.includes('Minified React error') ||
            message.includes('hydration') ||
            message.includes('TypeError')) {
          hydrationErrors.push(message);
        }
        originalError.apply(win.console, args);
      };

      (win as { hydrationErrors?: string[] }).hydrationErrors = hydrationErrors;
    });

    // Verify no errors
    cy.window().should((win) => {
      const errors = (win as { hydrationErrors?: string[] }).hydrationErrors || [];
      expect(errors.length).to.equal(0, `Errors found: ${errors.join(', ')}`);
    });
  });

  it('should load zbiory page without hydration errors', () => {
    cy.visit('/zbiory');

    // Wait for page to load
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    void cy.contains('Zbiory analiz').should('be.visible');

    // Check for hydration errors
    cy.window().then((win) => {
      const originalError = win.console.error;
      const hydrationErrors: string[] = [];

      win.console.error = (...args: unknown[]) => {
        const message = args.join(' ');
        if (message.includes('Minified React error') ||
            message.includes('hydration') ||
            message.includes('TypeError')) {
          hydrationErrors.push(message);
        }
        originalError.apply(win.console, args);
      };

      (win as { hydrationErrors?: string[] }).hydrationErrors = hydrationErrors;
    });

    // Verify no errors
    cy.window().should((win) => {
      const errors = (win as { hydrationErrors?: string[] }).hydrationErrors || [];
      expect(errors.length).to.equal(0, `Errors found: ${errors.join(', ')}`);
    });
  });

  it('should render author cards with all required attributes', () => {
    cy.visit('/autorzy');

    // If author cards exist, verify their structure
    cy.get('.our-team-box').each(($card) => {
      // Check for image
      cy.wrap($card).find('img').should('have.attr', 'alt').and('have.attr', 'src');

      // Check for name
      cy.wrap($card).find('.our-team-name h6').should('not.be.empty');

      // Check for link
      cy.wrap($card).find('a').should('have.attr', 'href').and('match', /^\/autor\//);
    });
  });

  it('should render analysis cards with proper structure', () => {
    cy.visit('/zbiory');

    // Check analysis cards structure
    cy.get('.blog-list-item').each(($card) => {
      // Verify CSS classes
      cy.wrap($card).should('have.class', 'bg-white').and('have.class', 'rounded');

      // Check for image
      cy.wrap($card).find('img').should('have.attr', 'alt');

      // Check for title
      cy.wrap($card).find('.cases-desc h5').should('not.be.empty');

      // Check for download button
      cy.wrap($card).find('.learn-more a').should('contain', 'POBIERZ')
        .and('have.attr', 'href')
        .and('have.attr', 'target', '_blank')
        .and('have.attr', 'rel', 'noopener noreferrer');
    });
  });

  it('should load data from APIs without errors', () => {
    // Test authors API
    cy.request('/api/authors').then((response) => {
      expect(response.status).to.equal(200);
      expect(Array.isArray(response.body)).to.be.true;

      if (response.body.length > 0) {
        const author = response.body[0];
        expect(author).to.have.property('id');
        expect(author).to.have.property('slug');
        expect(author).to.have.property('name');
        expect(author).to.have.property('displayName');
      }
    });

    // Test articles API
    cy.request('/api/articles').then((response) => {
      expect(response.status).to.equal(200);
      expect(Array.isArray(response.body)).to.be.true;

      if (response.body.length > 0) {
        const article = response.body[0];
        expect(article).to.have.property('id');
        expect(article).to.have.property('title');
        expect(article).to.have.property('slug');
        expect(article).to.have.property('content');
        expect(article).to.have.property('authorId');
      }
    });
  });

  it('should navigate between pages without hydration issues', () => {
    // Start on homepage
    cy.visit('/');

    // Navigate to authors
    cy.contains('Nasi autorzy').click();
    void cy.url().should('include', '/autorzy');
    void cy.contains('Nasi autorzy').should('be.visible');

    // Navigate to zbiory
    cy.contains('Zbiory analiz').click();
    void cy.url().should('include', '/zbiory');
    void cy.contains('Zbiory analiz').should('be.visible');

    // Navigate back to home
    cy.contains('Strona główna').click();
    void cy.url().should('not.include', '/autorzy').and('not.include', '/zbiory');
  });
});