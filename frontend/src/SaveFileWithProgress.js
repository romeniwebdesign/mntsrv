import React, { useState, useRef } from "react";
import { Button, Badge, Alert } from "react-bootstrap";

function SaveFileWithProgress({
  url,
  filename = "download.dat",
  className = "",
  ...props
}) {
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(null);
  const [eta, setEta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [downloaded, setDownloaded] = useState(false);

  const abortRef = useRef(false);
  const readerRef = useRef(null);
  const writableRef = useRef(null);

  const handleDownload = async () => {
    setSaving(true);
    setProgress(0);
    setSpeed(null);
    setEta(null);
    setError(null);
    setDownloaded(false);
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
      setDownloaded(true);
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
    <div style={{ width: "100%" }} className={className} {...props}>
      <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 8 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          minWidth: 0,
          flexGrow: 1,
          justifyContent: "flex-start"
        }}>
          <span style={{ fontSize: 20, marginRight: 6 }}>📄</span>
          <span style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 500,
            fontSize: 16,
            minWidth: 0,
            flex: 1,
            textAlign: "left"
          }}>
            {filename}
          </span>
        </div>
        {downloaded ? (
          <span style={{ fontSize: 22, color: "#28a745", marginLeft: 8 }} title="Heruntergeladen">✅</span>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant={saving ? "primary" : "success"}
              disabled={saving}
              onClick={handleDownload}
              style={{ minWidth: 100 }}
            >
              {saving ? "Speichert..." : "Download"}
            </Button>
            {saving && (
              <Button
                type="button"
                size="sm"
                variant="outline-danger"
                onClick={handleAbort}
                style={{ marginLeft: 6 }}
              >
                Abbrechen
              </Button>
            )}
          </>
        )}
      </div>
      {saving && (
        <div style={{ marginTop: 8 }}>
          <div className="mb-2 progress" style={{ minHeight: 20 }}>
            <div
              role="progressbar"
              className="progress-bar progress-bar-animated progress-bar-striped"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ width: `${progress}%` }}
            >
              {progress}%
            </div>
          </div>
          <div className="d-flex justify-content-between small text-muted">
            <span>
              <Badge bg="secondary">Speed: {speed || ""} MB/s</Badge>
            </span>
            <span>
              <Badge bg="info">ETA: {eta || ""} s</Badge>
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Alert variant="danger" className="small mb-0">
            Fehler: {error}
            {error === "Abgebrochen" && (
              <div className="mt-1">
                <small>Die unvollständige Datei muss ggf. manuell gelöscht werden.</small>
              </div>
            )}
          </Alert>
        </div>
      )}
    </div>
  );
}

export default SaveFileWithProgress;
