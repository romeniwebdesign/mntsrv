import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Form, Button, Alert, ListGroup, Spinner, Card, Container, Breadcrumb } from "react-bootstrap";
import SaveFileWithProgress from "./SaveFileWithProgress";

function ShareView() {
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [askPassword, setAskPassword] = useState(false);
  const [currentPath, setCurrentPath] = useState(""); // Track current folder path within share
  const [shareInfo, setShareInfo] = useState(null); // Store original share info

  const fetchShare = async (pw = null, path = "") => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (path) {
        // Browse subfolder
        const params = new URLSearchParams();
        params.append("password", pw || password || "");
        params.append("path", path);
        res = await fetch(`/api/share/${token}/browse`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
      } else {
        // Access root share
        const params = new URLSearchParams();
        params.append("password", pw || "");
        res = await fetch(`/api/share/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
      }

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
        setCurrentPath(path);
        if (!shareInfo) setShareInfo(d); // Store original share info
        setAskPassword(false);
      } else {
        // File download (legacy, fallback)
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
    const filePath = currentPath ? `${currentPath}/${filename}` : filename;
    let url = `/api/share/${token}/download?file=${encodeURIComponent(filePath)}`;
    if (pw) url += `&password=${encodeURIComponent(pw)}`;
    return url;
  };

  const getFolderDownloadUrl = (folderPath = currentPath) => {
    let url = `/api/share/${token}/download-folder`;
    const params = new URLSearchParams();
    if (password) params.append("password", password);
    if (folderPath) params.append("path", folderPath);
    if (params.toString()) url += `?${params.toString()}`;
    return url;
  };

  const handleFolderClick = (folderName) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    fetchShare(password, newPath);
  };

  const handleBreadcrumbClick = (targetPath) => {
    fetchShare(password, targetPath);
  };

  const handleFolderZipDownload = (folderPath = currentPath) => {
    window.open(getFolderDownloadUrl(folderPath), '_blank');
  };

  // Create breadcrumb navigation
  const getBreadcrumbs = () => {
    const segments = currentPath ? currentPath.split("/").filter(Boolean) : [];
    const breadcrumbs = [
      { name: "🏠", path: "" }
    ];
    
    let buildPath = "";
    for (const segment of segments) {
      buildPath = buildPath ? `${buildPath}/${segment}` : segment;
      breadcrumbs.push({ name: segment, path: buildPath });
    }
    
    return breadcrumbs;
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

  // Show password form in centered layout if needed
  if (askPassword) {
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
        <Card className="text-center w-100" style={{ maxWidth: 400 }}>
          <Card.Header>Freigabe</Card.Header>
          <Card.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form onSubmit={handlePassword}>
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
          </Card.Body>
        </Card>
      </Container>
    );
  }

  // Full-width layout for file/folder content
  return (
    <Container fluid className="py-2 py-md-3">
      {/* Header with logo and share info */}
      <div className="mb-3 px-2 px-md-3">
        {/* Mobile: Stack vertically, Desktop: Side by side */}
        <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center">
          <div className="d-flex align-items-center mb-2 mb-md-0">
            <div className="me-3">
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "1rem",
                  letterSpacing: 1,
                  color: "#1b4571",
                  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
                }}
                className="d-none d-md-block"
              >
                MNTSRV
              </div>
              <div
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  letterSpacing: 1,
                  color: "#1b4571",
                  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
                }}
                className="d-md-none"
              >
                MNTSRV
              </div>
              <div
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 400,
                  letterSpacing: 1,
                  color: "#9289A6",
                  lineHeight: 1,
                  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
                }}
              >
                SHARE
              </div>
            </div>
            <div>
              <h5 className="mb-0 text-mntsrv-dark d-md-none" style={{ fontSize: "1rem" }}>
                {data
                  ? data.type === "file"
                    ? data.path
                      ? data.path.split("/").pop()
                      : "Datei"
                    : data.type === "folder"
                    ? data.path
                      ? data.path.split("/").filter(Boolean).pop() || "Root"
                      : "Ordner"
                    : "Freigabe"
                  : "Freigabe"}
              </h5>
              <h4 className="mb-0 text-mntsrv-dark d-none d-md-block">
                {data
                  ? data.type === "file"
                    ? data.path
                      ? data.path.split("/").pop()
                      : "Datei"
                    : data.type === "folder"
                    ? data.path
                      ? data.path.split("/").filter(Boolean).pop() || "Root"
                      : "Ordner"
                    : "Freigabe"
                  : "Freigabe"}
              </h4>
            </div>
          </div>
          {/* File/folder info */}
          <div className="ms-md-auto">
            {data && data.type === "folder" && (
              <small className="text-muted">
                {data.entries.filter(e => !e.is_dir).length} Dateien,{" "}
                {formatSize(
                  data.entries
                    .filter(e => !e.is_dir)
                    .reduce((sum, e) => sum + (e.size || 0), 0)
                )}
              </small>
            )}
            {data && data.type === "file" && (
              <small className="text-muted">
                Dateigröße: {formatSize(data.size)}
              </small>
            )}
          </div>
        </div>
      </div>

      {/* Error messages */}
      {error && (
        <div className="px-2 px-md-3 mb-3">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}

      {/* File share */}
      {data && data.type === "file" && (
        <div className="px-2 px-md-3">
          <Card>
            <Card.Body className="text-center p-3 p-md-4">
              <div className="mb-3">
                <h6 className="d-md-none">📄 {data.path ? data.path.split("/").pop() : "Datei"}</h6>
                <h5 className="d-none d-md-block">📄 {data.path ? data.path.split("/").pop() : "Datei"}</h5>
                <p className="text-muted mb-3">Dateigröße: {formatSize(data.size)}</p>
              </div>
              <SaveFileWithProgress
                url={getDownloadUrl(password)}
                filename={data.path ? data.path.split("/").pop() : "download"}
              />
            </Card.Body>
          </Card>
        </div>
      )}

      {/* Folder share */}
      {data && data.type === "folder" && (
        <div>
          {/* Breadcrumb navigation */}
          <div className="px-2 px-md-3 mb-3">
            <Breadcrumb className="mb-0" style={{ fontSize: "0.9rem" }}>
              {getBreadcrumbs().map((crumb, index) => {
                const isLast = index === getBreadcrumbs().length - 1;
                return (
                  <Breadcrumb.Item
                    key={index}
                    active={isLast}
                    onClick={!isLast ? () => handleBreadcrumbClick(crumb.path) : undefined}
                    style={{ 
                      cursor: !isLast ? "pointer" : "default",
                      fontSize: "0.85rem"
                    }}
                    className="text-truncate"
                  >
                    {crumb.name}
                  </Breadcrumb.Item>
                );
              })}
            </Breadcrumb>
          </div>

          {/* Bulk download buttons */}
          <div className="px-2 px-md-3 mb-3">
            <Button
              variant="outline-primary"
              size="sm"
              onClick={() => handleFolderZipDownload()}
              className="w-100 w-md-auto"
            >
              📦 Download {currentPath ? 'Folder' : 'All'} as ZIP
            </Button>
          </div>

          {/* File/folder listing */}
          <div className="px-2 px-md-3">
            <ListGroup>
              {[...data.entries]
                .sort((a, b) => {
                  // Sort folders first, then files, both alphabetically
                  if (a.is_dir && !b.is_dir) return -1;
                  if (!a.is_dir && b.is_dir) return 1;
                  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
                })
                .map((entry) => (
                  <ListGroup.Item
                    key={`${entry.name}-${entry.is_dir ? "dir" : "file"}`}
                    action={entry.is_dir}
                    onClick={entry.is_dir ? () => handleFolderClick(entry.name) : undefined}
                    className="p-2 p-md-3"
                  >
                    {/* Mobile layout: Stack vertically */}
                    <div className="d-flex flex-column d-md-none">
                      <div className="d-flex align-items-center mb-2">
                        <span style={{ wordBreak: "break-word", fontSize: "0.9rem" }}>
                          {entry.is_dir ? "📁" : "📄"} {entry.name}
                        </span>
                      </div>
                      <div className="d-flex align-items-center justify-content-between">
                        {!entry.is_dir && entry.size !== undefined && (
                          <span className="text-muted" style={{ fontSize: "0.8rem" }}>
                            {formatSize(entry.size)}
                          </span>
                        )}
                        <div className="ms-auto">
                          {entry.is_dir ? (
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const folderPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                                handleFolderZipDownload(folderPath);
                              }}
                              style={{ fontSize: "0.8rem" }}
                            >
                              📦 ZIP
                            </Button>
                          ) : (
                            <SaveFileWithProgress
                              url={getDownloadUrl(entry.name, password)}
                              filename={entry.name}
                              className="btn btn-sm btn-outline-success"
                              style={{ minWidth: "70px", fontSize: "0.8rem" }}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Desktop layout: Single row */}
                    <div className="d-none d-md-flex align-items-center">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="d-flex align-items-center">
                          <span style={{ wordBreak: "break-word" }}>
                            {entry.is_dir ? "📁" : "📄"} {entry.name}
                          </span>
                          {!entry.is_dir && entry.size !== undefined && (
                            <span className="text-muted ms-2" style={{ fontSize: "0.85em", flexShrink: 0 }}>
                              {formatSize(entry.size)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", marginLeft: 12, flexShrink: 0 }}>
                        {entry.is_dir ? (
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              const folderPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                              handleFolderZipDownload(folderPath);
                            }}
                          >
                            📦 ZIP
                          </Button>
                        ) : (
                          <SaveFileWithProgress
                            url={getDownloadUrl(entry.name, password)}
                            filename={entry.name}
                            className="btn btn-sm btn-outline-success"
                            style={{ minWidth: "80px" }}
                          />
                        )}
                      </div>
                    </div>
                  </ListGroup.Item>
                ))}
            </ListGroup>
          </div>
        </div>
      )}
    </Container>
  );
}

export default ShareView;
