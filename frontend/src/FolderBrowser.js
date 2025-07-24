import React, { useState, useEffect } from "react";
import { ListGroup, Button, Spinner, Alert, Breadcrumb } from "react-bootstrap";
import ShareForm from "./ShareForm";
import { useParams, useNavigate } from "react-router-dom";

const PAGE_SIZE = 200;

function FolderBrowser({ token, user, authFetch }) {
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
  const [renamingItem, setRenamingItem] = useState(null);
  const [newName, setNewName] = useState("");

  // Permission checks
  const canShare = user && ["admin", "power", "standard"].includes(user.role);
  const canDelete = user && ["admin", "power"].includes(user.role);
  const canRename = user && ["admin", "power"].includes(user.role);

  const fetchFolder = async (newAbsPath = absPath, newOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (newAbsPath) params.append("path", newAbsPath);
      params.append("offset", newOffset);
      params.append("limit", PAGE_SIZE);
      const res = await authFetch(`/api/folder?${params.toString()}`);
      if (!res.ok) throw new Error("Fehler beim Laden des Ordners");
      const data = await res.json();
      setPath(data.path);
      setEntries(newOffset === 0 ? data.entries : [...entries, ...data.entries]);
      setOffset(newOffset + data.entries.length);
      setHasMore(data.has_more);
    } catch (err) {
      if (err.message !== "Authentication failed") {
        setError(err.message);
      }
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

  const handleDelete = async (entry) => {
    if (!window.confirm(`Möchten Sie "${entry.name}" wirklich löschen?`)) {
      return;
    }

    try {
      const itemPath = path ? `${path}/${entry.name}` : entry.name;
      const response = await authFetch(`/api/file?path=${encodeURIComponent(itemPath)}`, {
        method: "DELETE"
      });

      if (response.ok) {
        // Refresh the folder view
        fetchFolder(absPath, 0);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || "Failed to delete item");
      }
    } catch (err) {
      setError("Error deleting item: " + err.message);
    }
  };

  const handleRename = async (entry) => {
    setRenamingItem(entry);
    setNewName(entry.name);
  };

  const handleRenameSubmit = async () => {
    if (!newName || newName === renamingItem.name) {
      setRenamingItem(null);
      return;
    }

    try {
      const itemPath = path ? `${path}/${renamingItem.name}` : renamingItem.name;
      const response = await authFetch(`/api/file/rename?old_path=${encodeURIComponent(itemPath)}&new_name=${encodeURIComponent(newName)}`, {
        method: "PUT"
      });

      if (response.ok) {
        setRenamingItem(null);
        setNewName("");
        // Refresh the folder view
        fetchFolder(absPath, 0);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || "Failed to rename item");
      }
    } catch (err) {
      setError("Error renaming item: " + err.message);
    }
  };

  const handleRenameCancel = () => {
    setRenamingItem(null);
    setNewName("");
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
                {isLast && canShare && (
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
                  {renamingItem && renamingItem.name === entry.name ? (
                    <div className="d-flex align-items-center">
                      <input
                        type="text"
                        className="form-control form-control-sm me-2"
                        style={{ width: "150px" }}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") handleRenameSubmit();
                          if (e.key === "Escape") handleRenameCancel();
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        size="sm"
                        variant="success"
                        className="me-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameSubmit();
                        }}
                      >
                        ✓
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameCancel();
                        }}
                      >
                        ✗
                      </Button>
                    </div>
                  ) : (
                    <>
                      {entry.is_dir && (
                        <Button
                          size="sm"
                          variant="outline-info"
                          className="me-2"
                          onClick={async e => {
                            e.stopPropagation();
                            try {
                              await authFetch(`/api/scan?path=${encodeURIComponent(path ? path + "/" + entry.name : entry.name)}`, {
                                method: "POST",
                              });
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
                      {canShare && (
                        <Button
                          size="sm"
                          variant="outline-success"
                          className="me-2"
                          onClick={e => {
                            e.stopPropagation();
                            setSharePath(path ? `${path}/${entry.name}` : entry.name);
                          }}
                        >
                          Share
                        </Button>
                      )}
                      {canRename && (
                        <Button
                          size="sm"
                          variant="outline-warning"
                          className="me-2"
                          onClick={e => {
                            e.stopPropagation();
                            handleRename(entry);
                          }}
                        >
                          Rename
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={e => {
                            e.stopPropagation();
                            handleDelete(entry);
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </>
                  )}
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
          authFetch={authFetch}
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
