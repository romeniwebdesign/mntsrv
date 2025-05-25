import React, { useEffect, useState } from "react";
import { ListGroup, Button, Spinner, Alert, Form, InputGroup, Card } from "react-bootstrap";

function SharesPage({ token }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [scanStatus, setScanStatus] = useState(null);

  useEffect(() => {
    let interval;
    const fetchScanStatus = async () => {
      try {
        const res = await fetch("/api/scan_status");
        const data = await res.json();
        setScanStatus(data);
      } catch {
        setScanStatus(null);
      }
    };
    fetchScanStatus();
    interval = setInterval(fetchScanStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
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
  }, [token]);

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
    <Card>
      <Card.Body>
        <Card.Title>Aktive Freigaben</Card.Title>
        {/* Fortschrittsanzeige für Scan */}
        {scanStatus && scanStatus.status !== "idle" && scanStatus.done === false && (
          <div className="mb-3">
            <div>
              <b>Scan läuft:</b> {scanStatus.scanned} / {scanStatus.total} ({Math.round((scanStatus.scanned / scanStatus.total) * 100)}%)
            </div>
            <div className="progress" style={{ height: 20 }}>
              <div
                className="progress-bar progress-bar-striped progress-bar-animated"
                role="progressbar"
                style={{ width: `${(scanStatus.scanned / scanStatus.total) * 100}%` }}
                aria-valuenow={scanStatus.scanned}
                aria-valuemin={0}
                aria-valuemax={scanStatus.total}
              >
                {Math.round((scanStatus.scanned / scanStatus.total) * 100)}%
              </div>
            </div>
            <div className="small text-muted mt-1" style={{ wordBreak: "break-all" }}>
              {scanStatus.current}
            </div>
          </div>
        )}
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
      </Card.Body>
    </Card>
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

export default SharesPage;
