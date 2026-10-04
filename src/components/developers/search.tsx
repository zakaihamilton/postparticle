"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { guideSearchIndex, type GuideSearchEntry } from "./search-index";
import styles from "./developers.module.css";

const resultLimit = 8;

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function matches(entry: GuideSearchEntry, query: string) {
  const queryText = normalize(query);
  const queryWords = queryText.split(/\s+/).filter(Boolean);
  const content = normalize(
    `${entry.page} ${entry.section} ${entry.text} ${entry.code ?? ""}`,
  );
  return (
    queryWords.length > 0 && queryWords.every((word) => content.includes(word))
  );
}

function excerpt(entry: GuideSearchEntry, query: string) {
  const content = `${entry.text} ${entry.code ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  const lower = content.toLocaleLowerCase();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const matchAt = words
    .map((word) => lower.indexOf(word))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (matchAt === undefined) return content.slice(0, 132);
  const start = Math.max(0, matchAt - 48);
  const end = Math.min(content.length, matchAt + 88);
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${
    end < content.length ? "…" : ""
  }`;
}

export default function DeveloperSearch() {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const results = useMemo(() => {
    if (!query.trim()) return [];
    return guideSearchIndex
      .filter((entry) => matches(entry, query))
      .sort((a, b) => {
        const queryText = normalize(query);
        const rank = (entry: GuideSearchEntry) => {
          if (normalize(entry.section).includes(queryText)) return 0;
          if (normalize(entry.page).includes(queryText)) return 1;
          if (normalize(entry.text).includes(queryText)) return 2;
          return 3;
        };
        return rank(a) - rank(b);
      });
  }, [query]);
  const visibleResults = results.slice(0, resultLimit);

  function clearSearch() {
    setQuery("");
    inputRef.current?.focus();
  }

  function focusResult(index: number) {
    resultRefs.current[index]?.focus();
  }

  return (
    <section className={styles.search} aria-label="Search developer guides">
      <label htmlFor="developer-guide-search">Search guides</label>
      <input
        ref={inputRef}
        id="developer-guide-search"
        type="search"
        value={query}
        placeholder="Search guides and code"
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && results.length > 0) {
            event.preventDefault();
            focusResult(0);
          } else if (event.key === "Escape" && query) {
            event.preventDefault();
            clearSearch();
          }
        }}
      />
      {query && (
        <button
          className={styles.searchClear}
          type="button"
          onClick={clearSearch}
        >
          Clear search
        </button>
      )}
      {!query.trim() ? (
        <p className={styles.searchHint}>
          Search headings, guide text, and code.
        </p>
      ) : results.length === 0 ? (
        <div className={styles.searchEmpty} role="status">
          <p>No guide sections match “{query.trim()}”.</p>
        </div>
      ) : (
        <>
          <p className={styles.searchCount} role="status" aria-live="polite">
            {results.length} {results.length === 1 ? "section" : "sections"}{" "}
            found
          </p>
          <ul className={styles.searchResults} aria-label="Search results">
            {visibleResults.map((result, index) => (
              <li key={`${result.href}#${result.id}`}>
                <Link
                  ref={(element) => {
                    resultRefs.current[index] = element;
                  }}
                  href={`${result.href}#${result.id}`}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      focusResult(
                        Math.min(index + 1, visibleResults.length - 1),
                      );
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      if (index === 0) inputRef.current?.focus();
                      else focusResult(index - 1);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      clearSearch();
                    }
                  }}
                >
                  <span>{result.page}</span>
                  <strong>{result.section}</strong>
                  <small>{excerpt(result, query)}</small>
                </Link>
              </li>
            ))}
          </ul>
          {results.length > resultLimit && (
            <p className={styles.searchHint}>
              Showing the first {resultLimit} of {results.length} matching
              sections.
            </p>
          )}
        </>
      )}
    </section>
  );
}
