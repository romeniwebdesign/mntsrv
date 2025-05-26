import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Form, Button, Alert, ListGroup, Spinner, Card, Container } from "react-bootstrap";
import SaveFileWithProgress from "./SaveFileWithProgress";

function ShareView() {
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [askPassword, setAskPassword] = useState(false);

  const fetchShare = async (pw = null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append("password", pw || "");
      const res = await fetch(`/api/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (res.status === 401) {
        setAskPassword(true);
        if (pw) {
          setError("Falsches Passwort.");
        } else {
          setError(null);
        }
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setAskPassword(false);
        setError("Freigabe ungültig oder abgelaufen.");
        setLoading(false);
        return;
      }
      const ct = res.headers.get("content-type");
      if (ct && ct.startsWith("application/json")) {
        const d = await res.json();
        setData(d);
        setAskPassword(false);
      } else {
        // Datei-Download (legacy, fallback)
        window.location = `/api/share/${token}/download${pw ? "?password=" + encodeURIComponent(pw) : ""}`;
      }
    } catch (err) {
      setError("Unbekannter Fehler.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchShare();
    // eslint-disable-next-line
  }, [token]);

  const handlePassword = (e) => {
    e.preventDefault();
    fetchShare(password);
  };

  const getDownloadUrl = (filename, pw) => {
    let url = `/api/share/${token}/download?file=${encodeURIComponent(filename)}`;
    if (pw) url += `&password=${encodeURIComponent(pw)}`;
    return url;
  };

  // Helper to format file size
  function formatSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    let val = bytes / Math.pow(k, i);
    if (i >= 3) {
      // GB or higher, show 1 decimal
      return val.toFixed(1) + " " + sizes[i];
    }
    return val.toFixed(2) + " " + sizes[i];
  }

  if (loading) return (
    <Container className="d-flex justify-content-center align-items-center min-vh-100">
      <Spinner />
    </Container>
  );

  return (
    <Container className="d-flex flex-column align-items-center justify-content-center min-vh-100">
      {/* Logo */}
      <div className="text-center mb-4">
        <div
          style={{
            fontWeight: 700,
            fontSize: "1.5rem",
            letterSpacing: 1,
            color: "#1b4571",
            marginBottom: 2,
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
          }}
        >
          MNTSRV
        </div>
        <div
          style={{
            fontSize: "1rem",
            fontWeight: 400,
            letterSpacing: 2,
            color: "#9289A6",
            lineHeight: 1.2,
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
          }}
        >
          MOUNT. BROWSE. SHARE.
        </div>
      </div>
      <Card className="text-center w-100" style={{ maxWidth: 600 }}>
        <Card.Header>
          {data
            ? data.type === "file"
              ? data.path
                ? data.path.split("/").pop()
                : "Datei"
              : data.type === "folder"
              ? data.path
                ? data.path.split("/").filter(Boolean).pop() || "/"
                : "Ordner"
              : "Freigabe"
            : "Freigabe"}
        </Card.Header>
        <Card.Body>
          {/* Error messages */}
          {error && <Alert variant="danger">{error}</Alert>}
          {/* Password form */}
          {askPassword && (
            <Form onSubmit={handlePassword} className="mb-3">
              <Form.Group>
                <Form.Label>Passwort</Form.Label>
                <Form.Control
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </Form.Group>
              <Button type="submit" className="mt-2">
                Anzeigen
              </Button>
            </Form>
          )}
          {/* File share */}
          {data && data.type === "file" && (
            <div>
              <SaveFileWithProgress
                url={getDownloadUrl(password)}
                filename={data.path ? data.path.split("/").pop() : "download"}
              />
            </div>
          )}
          {/* Folder share */}
          {data && data.type === "folder" && (
            <ListGroup className="mb-2">
              {[...data.entries]
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
                .map((entry) => (
                  <ListGroup.Item
                    key={`${entry.name}-${entry.is_dir ? "dir" : "file"}`}
                    style={{
                      border: "none",
                      borderBottom: "1px solid #eee",
                      padding: "0.5rem 1rem",
                      display: "block"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                      {entry.is_dir ? (
                        <span style={{ flex: 1 }}>
                          📁 {entry.name}
                        </span>
                      ) : (
                        <SaveFileWithProgress
                          url={getDownloadUrl(entry.name, password)}
                          filename={entry.name}
                          className="p-0 m-0 border-0 shadow-none rounded-0"
                        />
                      )}
                    </div>
                  </ListGroup.Item>
                ))}
            </ListGroup>
          )}
        </Card.Body>
        <Card.Footer className="text-muted">
          {/* Progress: SaveFileWithProgress renders its own progress bar per file.
              If multiple downloads are started, each file shows its own progress. */}
          {data && data.type === "file" && (
            <span>Dateigröße: {formatSize(data.size)}</span>
          )}
          {data && data.type === "folder" && (
            <span>
              {data.entries.filter(e => !e.is_dir).length} Dateien,{" "}
              {formatSize(
                data.entries
                  .filter(e => !e.is_dir)
                  .reduce((sum, e) => sum + (e.size || 0), 0)
              )}
            </span>
          )}
        </Card.Footer>
      </Card>
    </Container>
  );
}

export default ShareView;
