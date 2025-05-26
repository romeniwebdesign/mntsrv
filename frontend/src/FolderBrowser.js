import React, { useState, useEffect } from "react";
import { ListGroup, Button, Spinner, Alert, Breadcrumb } from "react-bootstrap";
import ShareForm from "./ShareForm";
import { useParams, useNavigate } from "react-router-dom";

const PAGE_SIZE = 200;

function FolderBrowser({ token }) {
  const params = useParams();
  const navigate = useNavigate();
  const scanRoot = window.SCAN_ROOT || "/";
  const relPath = params["*"] || "";
  const absPath = relPath ? scanRoot + "/" + relPath : scanRoot;

  const [path, setPath] = useState(absPath);
  const [entries, setEntries] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sharePath, setSharePath] = useState(null);

  const fetchFolder = async (newAbsPath = absPath, newOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (newAbsPath) params.append("path", newAbsPath);
      params.append("offset", newOffset);
      params.append("limit", PAGE_SIZE);
      const res = await fetch(`/api/folder?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Fehler beim Laden des Ordners");
      const data = await res.json();
      setPath(data.path);
      setEntries(newOffset === 0 ? data.entries : [...entries, ...data.entries]);
      setOffset(newOffset + data.entries.length);
      setHasMore(data.has_more);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFolder(absPath, 0);
    // eslint-disable-next-line
  }, [token, absPath]);

  const handleOpenFolder = (entry) => {
    if (entry.is_dir) {
      let rel = relPath ? relPath + "/" + entry.name : entry.name;
      navigate("/browse" + (rel ? "/" + rel : ""));
    }
  };

  const handleBack = () => {
    const segments = relPath ? relPath.split("/").filter(Boolean) : [];
    if (segments.length > 0) {
      const prev = segments.slice(0, -1).join("/");
      navigate("/browse" + (prev ? "/" + prev : ""));
    }
  };

  const handleShowMore = () => {
    fetchFolder(absPath, offset);
  };

  // Breadcrumbs (relativ zu SCAN_ROOT, mit Router-Navigation)
  const segments = relPath ? relPath.split("/").filter(Boolean) : [];
  const breadcrumbs = [
    { name: "🏠", rel: "" },
    ...segments.map((seg, idx) => ({
      name: seg,
      rel: segments.slice(0, idx + 1).join("/"),
    })),
  ];

  // Scan-Status für Fortschrittsanzeige
  const [scanStatus, setScanStatus] = useState(null);
  const scanIntervalRef = React.useRef(null);

  // Fetch scan status once on mount or folder change
  useEffect(() => {
    let cancelled = false;

    const fetchScanStatus = async () => {
      try {
        const res = await fetch("/api/scan_status");
        const data = await res.json();
        if (!cancelled) setScanStatus(data);

        // If scan is running, start polling
        if (data && data.status !== "idle" && data.done === false) {
          if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = setInterval(async () => {
            try {
              const res = await fetch("/api/scan_status");
              const data = await res.json();
              if (!cancelled) setScanStatus(data);
              // Stop polling if scan is done or idle
              if (!data || data.status === "idle" || data.done === true) {
                if (scanIntervalRef.current) {
                  clearInterval(scanIntervalRef.current);
                  scanIntervalRef.current = null;
                }
              }
            } catch {
              if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
              }
            }
          }, 2000);
        }
      } catch {
        if (!cancelled) setScanStatus(null);
      }
    };

    fetchScanStatus();

    return () => {
      cancelled = true;
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [absPath]);

  return (
    <div>
      <div className="d-flex align-items-center mb-2">
        <Breadcrumb className="mb-0" aria-label="breadcrumb">
          {breadcrumbs.map((bc, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <Breadcrumb.Item
                key={bc.rel}
                linkAs="a"
                href={isLast ? undefined : "/browse" + (bc.rel ? "/" + bc.rel : "")}
                active={isLast}
                aria-current={isLast ? "page" : undefined}
                onClick={e => {
                  if (!isLast) {
                    e.preventDefault();
                    navigate("/browse" + (bc.rel ? "/" + bc.rel : ""));
                  }
                }}
                className={isLast ? "d-flex align-items-center" : undefined}
              >
                {bc.name}
                {isLast && (
                  <Button
                    size="sm"
                    variant="outline-success"
                    className="ms-2"
                    onClick={e => {
                      e.stopPropagation();
                      setSharePath(path);
                    }}
                  >
                    Freigeben
                  </Button>
                )}
              </Breadcrumb.Item>
            );
          })}
        </Breadcrumb>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <ListGroup>
        {(() => {
          // Sortiere: Ordner oben, Dateien unten, jeweils alphabetisch
          const sorted = [...entries].sort((a, b) => {
            if (a.is_dir && !b.is_dir) return -1;
            if (!a.is_dir && b.is_dir) return 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          });
          return sorted.map((entry) => (
            <ListGroup.Item
              key={`${entry.name}-${entry.is_dir ? "dir" : "file"}`}
              action={entry.is_dir}
              onClick={() => entry.is_dir && handleOpenFolder(entry)}
              style={{ padding: "0.5rem 1rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span>
                    {entry.is_dir ? "📁" : "📄"} {entry.name}
                    {entry.is_dir && entry.has_children && <span className="text-muted ms-2">(…)</span>}
                    {entry.is_dir && scanStatus && scanStatus.folders && scanStatus.folders[entry.name] && !scanStatus.folders[entry.name].done && (
                      <span className="text-info ms-2" style={{ fontSize: "0.95em" }}>
                        {`{Scanning ${scanStatus.folders[entry.name].scanned} / ${scanStatus.folders[entry.name].total} : ${scanStatus.folders[entry.name].current}}`}
                      </span>
                    )}
                    {!entry.is_dir && entry.size !== undefined && (
                      <span className="text-muted ms-2" style={{ fontSize: "0.95em" }}>
                        {formatSize(entry.size)}
                      </span>
                    )}
                  </span>
                  {/* Progress bar: full width, below the folder name */}
                  {entry.is_dir && scanStatus && scanStatus.folders && scanStatus.folders[entry.name] && !scanStatus.folders[entry.name].done && (
                    <div style={{ width: "100%", marginTop: 2 }}>
                      <div
                        style={{
                          height: 4,
                          background: "#e9ecef",
                          borderRadius: 2,
                          width: "100%",
                          position: "relative"
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            background: "#17a2b8",
                            borderRadius: 2,
                            width: `${scanStatus.folders[entry.name].total > 0
                              ? Math.min(100, Math.round((scanStatus.folders[entry.name].scanned / scanStatus.folders[entry.name].total) * 100))
                              : 0}%`,
                            transition: "width 0.3s"
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", marginLeft: 12 }}>
                  {entry.is_dir && (
                    <Button
                      size="sm"
                      variant="outline-info"
                      className="me-2"
                      onClick={async e => {
                        e.stopPropagation();
                        try {
                          await fetch(`/api/scan?path=${encodeURIComponent(path ? path + "/" + entry.name : entry.name)}`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          // Optional: Feedback, z.B. Toast oder Alert
                        } catch {}
                      }}
                    >
                      Rescan
                    </Button>
                  )}
                  {!entry.is_dir && (
                    <a
                      href={`/share/${btoa(encodeURIComponent((path ? path + "/" : "") + entry.name))}`}
                      className="btn btn-sm btn-outline-primary me-2"
                      download={entry.name}
                      onClick={e => e.stopPropagation()}
                    >
                      Download
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={e => {
                      e.stopPropagation();
                      setSharePath(path ? `${path}/${entry.name}` : entry.name);
                    }}
                  >
                    Freigeben
                  </Button>
                </div>
              </div>
            </ListGroup.Item>
          ));
        })()}
      </ListGroup>
      {sharePath && (
        <ShareForm
          token={token}
          path={sharePath}
          onClose={() => setSharePath(null)}
        />
      )}
      {hasMore && (
        <div className="d-grid mt-2">
          <Button onClick={handleShowMore} disabled={loading}>
            {loading ? <Spinner size="sm" /> : "Mehr anzeigen"}
          </Button>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + " " + sizes[i];
}

export default FolderBrowser;
