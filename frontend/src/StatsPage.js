import React, { useEffect, useState } from "react";
import { Card, Spinner, Alert, ListGroup } from "react-bootstrap";

function StatsPage({ token, authFetch }) {
  const [scanStatus, setScanStatus] = useState(null);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch("/api/scan_status").then((res) => res.json()),
      authFetch("/api/shares").then((res) => res.json())
    ])
      .then(([scanStatusData, sharesData]) => {
        setScanStatus(scanStatusData);
        setShares(sharesData);
      })
      .catch((err) => {
        if (err.message !== "Authentication failed") {
          setError("Fehler beim Laden der Statistiken");
        }
      })
      .finally(() => setLoading(false));
  }, [token, authFetch]);

  function formatDateTime(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString("de-DE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return iso;
    }
  }

  function getScanDuration() {
    if (!scanStatus || !scanStatus.start_time || !scanStatus.end_time) return null;
    const start = new Date(scanStatus.start_time);
    const end = new Date(scanStatus.end_time);
    const diffMs = end - start;
    if (isNaN(diffMs) || diffMs < 0) return null;
    const seconds = Math.floor(diffMs / 1000) % 60;
    const minutes = Math.floor(diffMs / 60000) % 60;
    const hours = Math.floor(diffMs / 3600000);
    return `${hours > 0 ? hours + "h " : ""}${minutes > 0 ? minutes + "m " : ""}${seconds}s`;
  }

  return (
    <Card>
      <Card.Body>
        <Card.Title>Statistiken</Card.Title>
        {loading && <Spinner />}
        {error && <Alert variant="danger">{error}</Alert>}
        {!loading && !error && (
          <ListGroup variant="flush">
            <ListGroup.Item>
              <b>Ordner:</b>{" "}
              {scanStatus && typeof scanStatus.num_folders === "number" ? scanStatus.num_folders : "?"}
            </ListGroup.Item>
            <ListGroup.Item>
              <b>Dateien:</b>{" "}
              {scanStatus && typeof scanStatus.num_files === "number" ? scanStatus.num_files : "?"}
            </ListGroup.Item>
            <ListGroup.Item>
              <b>Gesamtanzahl Ordner/Dateien:</b>{" "}
              {scanStatus && typeof scanStatus.total === "number" ? scanStatus.total : "?"}
            </ListGroup.Item>
            <ListGroup.Item>
              <b>Initialer Scan abgeschlossen:</b>{" "}
              {scanStatus && scanStatus.done ? "Ja" : "Nein"}
            </ListGroup.Item>
            <ListGroup.Item>
              <b>Zeit für initialen Scan:</b>{" "}
              {getScanDuration() || "Nicht verfügbar"}
            </ListGroup.Item>
            <ListGroup.Item>
              <b>Aktive Freigaben:</b> {shares.length}
            </ListGroup.Item>
            <ListGroup.Item>
              <b>Aktive Downloads:</b> Nicht verfügbar
            </ListGroup.Item>
            <ListGroup.Item>
              <b>Scan gestartet am:</b>{" "}
              {scanStatus && scanStatus.start_time ? formatDateTime(scanStatus.start_time) : "?"}
            </ListGroup.Item>
            <ListGroup.Item>
              <b>Scan beendet am:</b>{" "}
              {scanStatus && scanStatus.end_time ? formatDateTime(scanStatus.end_time) : "?"}
            </ListGroup.Item>
          </ListGroup>
        )}
      </Card.Body>
    </Card>
  );
}

export default StatsPage;
