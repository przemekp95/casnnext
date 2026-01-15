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

// Typy filtrów
type SearchFilter = 'all' | 'title' | 'author' | 'content';
type SortOption = 'date' | 'relevance';

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
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [searchTime, setSearchTime] = useState<number>(0);

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

  // Funkcja podświetlania tekstu - zwraca bezpieczny HTML
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  };

  // Komponent do bezpiecznego renderowania HTML
  const HighlightedText = ({ text, query }: { text: string; query: string }) => {
    if (!query.trim()) return <span>{text}</span>;

    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

    return (
      <span>
        {parts.map((part, index) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={index} style={{
              backgroundColor: '#fff3cd',
              color: '#856404',
              padding: '2px 4px',
              borderRadius: '3px',
              fontWeight: 'bold'
            }}>
              {part}
            </mark>
          ) : (
            <span key={index}>{part}</span>
          )
        )}
      </span>
    );
  };

  // Funkcja wyszukiwania rozmytego (prosta implementacja)
  const fuzzyMatch = (text: string, query: string): number => {
    if (!query.trim()) return 0;

    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();

    // Dokładne dopasowanie
    if (textLower.includes(queryLower)) return 3;

    // Częściowe dopasowanie słów
    const queryWords = queryLower.split(' ');
    let score = 0;
    for (const word of queryWords) {
      if (textLower.includes(word)) score += 1;
    }

    // Proste fuzzy matching - sprawdzanie czy litery występują w kolejności
    let queryIndex = 0;
    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        queryIndex++;
      }
    }
    if (queryIndex === queryLower.length) score += 0.5;

    return score;
  };

  // Wyszukiwanie w czasie rzeczywistym z filtrowaniem i sortowaniem
  const filteredResults = useMemo(() => {
    const startTime = performance.now();

    if (!query.trim()) {
      setSearchTime(0);
      return [];
    }

    const searchTerm = query.toLowerCase();
    let results = searchIndex
      .filter(item => {
        switch (searchFilter) {
          case 'title':
            return item.title.toLowerCase().includes(searchTerm) || fuzzyMatch(item.title, query) > 0;
          case 'author':
            return item.author.toLowerCase().includes(searchTerm) || fuzzyMatch(item.author, query) > 0;
          case 'content':
            return item.content.toLowerCase().includes(searchTerm) || fuzzyMatch(item.content, query) > 0;
          case 'all':
          default:
            return (
              item.title.toLowerCase().includes(searchTerm) ||
              item.author.toLowerCase().includes(searchTerm) ||
              item.content.toLowerCase().includes(searchTerm) ||
              fuzzyMatch(item.title + ' ' + item.author + ' ' + item.content, query) > 1
            );
        }
      });

    // Sortowanie wyników
    if (sortBy === 'relevance') {
      results = results.sort((a, b) => {
        const scoreA = fuzzyMatch(a.title + ' ' + a.author + ' ' + a.content, query);
        const scoreB = fuzzyMatch(b.title + ' ' + b.author + ' ' + b.content, query);
        return scoreB - scoreA;
      });
    } else {
      // Sortowanie po dacie (domyślne)
      results = results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    const endTime = performance.now();
    setSearchTime(Math.round((endTime - startTime) * 100) / 100);

    return results.slice(0, 20); // Zwiększony limit dla lepszych wyników
  }, [query, searchIndex, searchFilter, sortBy]);

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

        {/* Filters and Controls */}
        {query.trim() && (
          <div
            style={{
              padding: '10px 20px',
              borderBottom: '1px solid #eee',
              backgroundColor: '#f8f9fa',
              display: 'flex',
              gap: '15px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}
          >
            {/* Filtry */}
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#666', marginRight: '5px' }}>Szukaj w:</span>
              {(['all', 'title', 'author', 'content'] as SearchFilter[]).map(filter => (
                <button
                  key={filter}
                  onClick={() => setSearchFilter(filter)}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: searchFilter === filter ? '#007bff' : 'white',
                    color: searchFilter === filter ? 'white' : '#666',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {filter === 'all' ? 'Wszystko' :
                   filter === 'title' ? 'Tytuły' :
                   filter === 'author' ? 'Autorzy' : 'Treść'}
                </button>
              ))}
            </div>

            {/* Sortowanie */}
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#666', marginRight: '5px' }}>Sortuj:</span>
              {(['date', 'relevance'] as SortOption[]).map(option => (
                <button
                  key={option}
                  onClick={() => setSortBy(option)}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: sortBy === option ? '#28a745' : 'white',
                    color: sortBy === option ? 'white' : '#666',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {option === 'date' ? 'Data' : 'Trafność'}
                </button>
              ))}
            </div>
          </div>
        )}

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
                {searchTime > 0 && (
                  <span style={{ marginLeft: '10px', fontSize: '12px' }}>
                    ({searchTime}ms)
                  </span>
                )}
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
                    <strong style={{ color: '#007bff' }}>
                      <HighlightedText text={result.title} query={query} />
                    </strong>
                  </div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
                    <HighlightedText text={result.author} query={query} /> • {result.date}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666', lineHeight: '1.4' }}>
                    <HighlightedText text={result.excerpt} query={query} />
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