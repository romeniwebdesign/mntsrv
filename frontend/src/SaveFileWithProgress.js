import React, { useState, useRef } from "react";
import { Button, ProgressBar, Row, Col, Badge, Alert } from "react-bootstrap";

function SaveFileWithProgress({ url, filename = "download.dat" }) {
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(null);
  const [eta, setEta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const abortRef = useRef(false);
  const readerRef = useRef(null);
  const writableRef = useRef(null);

  const handleDownload = async () => {
    setSaving(true);
    setProgress(0);
    setSpeed(null);
    setEta(null);
    setError(null);
    abortRef.current = false;
    const startTime = Date.now();

    try {
      const fileHandle = await window.showSaveFilePicker({ suggestedName: filename });
      const writable = await fileHandle.createWritable();
      writableRef.current = writable;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Fehler beim Download");

      const contentLength = parseInt(res.headers.get("content-length") || "0");
      const reader = res.body.getReader();
      readerRef.current = reader;

      let received = 0;

      while (true) {
        if (abortRef.current) {
          await reader.cancel();
          try { await writable.close(); } catch {}
          setError("Abgebrochen");
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        received += value.length;

        const percent = Math.floor((received / contentLength) * 100);
        const duration = (Date.now() - startTime) / 1000;
        const speedNow = received / 1024 / 1024 / duration; // MB/s
        const remainingTime = ((contentLength - received) / (received / duration)) || 0;

        setProgress(percent);
        setSpeed(speedNow.toFixed(2));
        setEta(remainingTime.toFixed(0));
      }

      try { await writable.close(); } catch {}
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setSaving(false);
      readerRef.current = null;
      writableRef.current = null;
    }
  };

  const handleAbort = async () => {
    abortRef.current = true;
    setSaving(false);
    setProgress(0);
    setError("Abgebrochen");
    try {
      if (readerRef.current) await readerRef.current.cancel();
      if (writableRef.current) {
        try { await writableRef.current.close(); } catch {}
        writableRef.current = null;
      }
    } catch {}
  };

  return (
    <div style={{ maxWidth: 600, width: "100%", margin: "0 auto" }} className="shadow-sm p-3 border rounded">
      <Row className="align-items-center mb-3 justify-content-center g-2">
        <Col xs="auto">
          <Button onClick={handleDownload} disabled={saving} variant="primary" size="sm">
            {saving ? "Speichert..." : "Herunterladen & Speichern"}
          </Button>
        </Col>
        {saving && (
          <Col xs="auto">
            <Button variant="outline-danger" size="sm" onClick={handleAbort}>
              Abbrechen
            </Button>
          </Col>
        )}
      </Row>

      {saving && (
        <>
          <ProgressBar now={progress} label={`${progress}%`} animated striped className="mb-2" style={{ minHeight: 20 }} />
          <div className="d-flex justify-content-between small text-muted">
            <span><Badge bg="secondary">Speed: {speed} MB/s</Badge></span>
            <span><Badge bg="info">ETA: {eta}s</Badge></span>
          </div>
        </>
      )}

      {error && (
        <Alert variant="danger" className="mt-3 small">
          Fehler: {error}
          {error === "Abgebrochen" && (
            <div className="mt-1">
              <small>Die unvollständige Datei muss ggf. manuell gelöscht werden.</small>
            </div>
          )}
        </Alert>
      )}
    </div>
  );
}

export default SaveFileWithProgress;
