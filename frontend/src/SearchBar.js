import React, { useState } from "react";
import { Form, FormControl, Button, ListGroup, InputGroup, Spinner } from "react-bootstrap";

function SearchBar({ token, onNavigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query || query.length < 2) return;
    setLoading(true);
    setShowResults(true);
    try {
      const params = new URLSearchParams();
      params.append("q", query);
      const res = await fetch(`/api/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Fehler bei der Suche");
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  const handleResultClick = (item) => {
    setShowResults(false);
    setQuery("");
    setResults([]);
    onNavigate(item);
  };

  return (
    <div style={{ position: "relative", minWidth: 300 }}>
      <Form className="d-flex" onSubmit={handleSearch} autoComplete="off">
        <InputGroup>
          <FormControl
            type="search"
            placeholder="Datei/Ordner suchen…"
            className="me-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && setShowResults(true)}
            minLength={2}
          />
          <Button type="submit" variant="outline-primary" disabled={loading || query.length < 2}>
            {loading ? <Spinner size="sm" /> : "Suchen"}
          </Button>
        </InputGroup>
      </Form>
      {showResults && results.length > 0 && (
        <ListGroup
          style={{
            position: "absolute",
            zIndex: 1000,
            width: "100%",
            maxHeight: 300,
            overflowY: "auto",
            marginTop: 2,
          }}
        >
          {results.map((item) => (
            <ListGroup.Item
              key={item.path}
              action
              onClick={() => handleResultClick(item)}
            >
              {item.is_dir ? "📁" : "📄"} <b>{item.name}</b>
              <div className="text-muted small">{item.path}</div>
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </div>
  );
}

export default SearchBar;
