import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Form, Button, Alert, ListGroup, Spinner } from "react-bootstrap";
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
        setError("Passwort erforderlich oder falsch.");
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("Freigabe ungültig oder abgelaufen");
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
      setError(err.message);
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

  const getDownloadUrl = (pw) =>
    `/api/share/${token}/download${pw ? "?password=" + encodeURIComponent(pw) : ""}`;

  if (loading) return <Spinner className="mt-5" />;

  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8f9fa",
      }}
    >
      <div
        style={{
          width: "50vw",
          height: "50vh",
          maxWidth: 600,
          maxHeight: "80vh",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
          padding: 32,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          overflow: "auto",
        }}
      >
        <h2>
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
        </h2>
        {error && <Alert variant="danger">{error}</Alert>}
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
        {data && data.type === "folder" && (
          <ListGroup>
            {data.entries.map((entry) => (
              <ListGroup.Item
                key={`${entry.name}-${entry.is_dir ? "dir" : "file"}`}
                className="d-flex justify-content-between align-items-center"
              >
                <span>
                  {entry.is_dir ? "📁" : "📄"} {entry.name}
                </span>
                {!entry.is_dir && (
                  <SaveFileWithProgress
                    url={
                      getDownloadUrl(password) +
                      `&file=${encodeURIComponent(entry.name)}`
                    }
                    filename={entry.name}
                  />
                )}
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
        {data && data.type !== "folder" && (
          <div className="mt-3">
            <SaveFileWithProgress
              url={getDownloadUrl(password)}
              filename={data.path ? data.path.split("/").pop() : "download"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ShareView;
