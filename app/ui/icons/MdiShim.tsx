"use client";

import { useEffect } from "react";
import { mdiMap } from "./mdi-map";

export function MdiShim() {
  useEffect(() => {
    // Suppress hydration warnings for MDI icon replacements
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const message = args.join(' ');
      if (message.includes('Hydration failed') && message.includes('mdi')) {
        return; // Suppress MDI-related hydration warnings
      }
      originalConsoleError.apply(console, args);
    };

    const replaceIcons = () => {
      document.querySelectorAll("i.mdi").forEach((el) => {
        const cls = Array.from(el.classList).find(c => c.startsWith("mdi-"));
        if (!cls || el.hasAttribute('data-replaced')) return;

        const svg = mdiMap[cls];
        if (!svg) return;

        // Create a wrapper div to maintain layout
        const wrapper = document.createElement('span');
        wrapper.innerHTML = svg;
        wrapper.className = el.className.replace('mdi', '').replace(/\s+/g, ' ').trim();
        wrapper.setAttribute('aria-hidden', 'true');

        // Copy any additional attributes
        Array.from(el.attributes).forEach(attr => {
          if (attr.name !== 'class') {
            wrapper.setAttribute(attr.name, attr.value);
          }
        });

        el.parentNode?.replaceChild(wrapper, el);
      });
    };

    // Replace icons immediately
    replaceIcons();

    // Also replace icons after a short delay to catch dynamically rendered content
    const timeoutId = setTimeout(replaceIcons, 100);

    // Set up a mutation observer to watch for new icons
    const observer = new MutationObserver((mutations) => {
      let shouldReplace = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.querySelectorAll && element.querySelectorAll('i.mdi').length > 0) {
              shouldReplace = true;
            }
            if (element.classList && element.classList.contains('mdi')) {
              shouldReplace = true;
            }
          }
        });
      });
      if (shouldReplace) {
        setTimeout(replaceIcons, 0);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
      console.error = originalConsoleError; // Restore original console.error
    };
  }, []);

  return null;
}