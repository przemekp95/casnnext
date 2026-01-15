"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

// Typy dla indeksu wyszukiwania
interface SearchResult {
  slug: string;
  title: string;
  author: string;
  date: string;
  excerpt: string;
  content: string;
}

// Komponent SearchModal
interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchIndex, setSearchIndex] = useState<SearchResult[]>([]);

  // Ładowanie indeksu wyszukiwania
  useEffect(() => {
    const loadSearchIndex = async () => {
      try {
        setIsLoading(true);
        // W prawdziwej aplikacji można by to zrobić przez API
        // Na razie symulujemy ładowanie indeksu
        const response = await fetch('/api/search-index');
        if (response.ok) {
          const index = await response.json();
          setSearchIndex(index);
        } else {
          // Fallback - puste wyniki
          setSearchIndex([]);
        }
      } catch (error) {
        console.error('Error loading search index:', error);
        setSearchIndex([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen && searchIndex.length === 0) {
      loadSearchIndex();
    }
  }, [isOpen, searchIndex.length]);

  // Wyszukiwanie w czasie rzeczywistym
  const filteredResults = useMemo(() => {
    if (!query.trim()) return [];

    const searchTerm = query.toLowerCase();
    return searchIndex
      .filter(item =>
        item.title.toLowerCase().includes(searchTerm) ||
        item.author.toLowerCase().includes(searchTerm) ||
        item.content.toLowerCase().includes(searchTerm)
      )
      .slice(0, 10); // Limit wyników
  }, [query, searchIndex]);

  // Obsługa zamykania modala przy naciśnięciu Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden'; // Blokada scrollowania tła
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Reset query przy zamykaniu
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="search-overlay"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '100px'
        }}
      />

      {/* Modal */}
      <div
        className="search-modal"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          zIndex: 10000,
          width: '90%',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <span
            className="mdi mdi-magnify"
            style={{
              fontSize: '20px',
              color: '#666'
            }}
          />
          <input
            type="text"
            placeholder="Szukaj w analizach..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '16px',
              padding: '8px 0'
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: '#666',
              cursor: 'pointer',
              padding: '4px'
            }}
            aria-label="Zamknij wyszukiwanie"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: '400px'
          }}
        >
          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              Ładowanie indeksu wyszukiwania...
            </div>
          ) : query.trim() === '' ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              Zacznij pisać, aby wyszukać w treściach analiz...
            </div>
          ) : filteredResults.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              Nie znaleziono wyników dla "{query}"
            </div>
          ) : (
            <div>
              <div style={{ padding: '10px 20px', color: '#666', fontSize: '14px' }}>
                Znaleziono {filteredResults.length} wyników
              </div>
              {filteredResults.map((result, index) => (
                <Link
                  key={result.slug}
                  href={`/analizy/${result.slug}`}
                  onClick={onClose}
                  style={{
                    display: 'block',
                    padding: '15px 20px',
                    borderBottom: index < filteredResults.length - 1 ? '1px solid #f0f0f0' : 'none',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9fa';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ marginBottom: '5px' }}>
                    <strong style={{ color: '#007bff' }}>{result.title}</strong>
                  </div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
                    {result.author} • {result.date}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666', lineHeight: '1.4' }}>
                    {result.excerpt}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}