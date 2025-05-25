import React, { useEffect, useState } from "react";
import { Modal, ListGroup, Button, Spinner, Alert, Form, InputGroup } from "react-bootstrap";

function SharesModal({ token, show, onClose }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");


  useEffect(() => {
    if (!show) return;
    setLoading(true);
    setError(null);
    fetch("/api/shares", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Fehler beim Laden der Shares");
        return res.json();
      })
      .then((data) => setShares(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [show, token]);

  const handleDelete = async (tokenToDelete) => {
    if (!window.confirm("Freigabe wirklich löschen?")) return;
    try {
      const res = await fetch(`/api/share/${tokenToDelete}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Fehler beim Löschen");
      setShares((s) => s.filter((share) => share.token !== tokenToDelete));
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredShares = shares.filter(
    (s) =>
      s.path.toLowerCase().includes(filter.toLowerCase()) ||
      s.token.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Aktive Freigaben</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <InputGroup className="mb-3">
          <Form.Control
            placeholder="Nach Pfad oder Token suchen…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </InputGroup>
        {loading && <Spinner />}
        {error && <Alert variant="danger">{error}</Alert>}
        {!loading && !error && (
          <ListGroup>
            {filteredShares.length === 0 && (
              <ListGroup.Item>Keine aktiven Freigaben.</ListGroup.Item>
            )}
            {filteredShares.map((share) => (
              <ListGroup.Item key={share.token} className="d-flex justify-content-between align-items-center">
                <div>
                  <div>
                    <b>Pfad:</b> {share.path}
                  </div>
                <div>
                  <b>Gültig bis:</b> {formatDate(share.expires_at)}
                </div>
                {share.password_plain && (
                  <div>
                    <b>Passwort:</b> <span style={{ fontFamily: "monospace" }}>{share.password_plain}</span>
                  </div>
                )}
                <div>
                  <b>Link:</b>{" "}
                  <a href={`/share/${share.token}`} target="_blank" rel="noopener noreferrer">
                    {window.location.origin}/share/{share.token}
                  </a>
                </div>
                </div>
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => handleDelete(share.token)}
                >
                  Löschen
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Schließen
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    // Format: 25.05.2025, 02:52 Uhr (ohne Sekunden, nur lokale Zeit)
    return d.toLocaleString("de-DE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }) + " Uhr";
  } catch {
    return iso;
  }
}

export default SharesModal;
