import React, { useState } from "react";
import { Form, Button, Alert, InputGroup, Modal } from "react-bootstrap";

function ShareForm({ token, path, onClose }) {
  const [password, setPassword] = useState("");
  const [expiresIn, setExpiresIn] = useState(60); // Minuten
  const [shareUrl, setShareUrl] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleShare = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("path", path);
      if (password) params.append("password", password);
      params.append("expires_in", expiresIn * 60);
      const res = await fetch(`/api/share?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Fehler beim Erstellen des Freigabelinks");
      const data = await res.json();
      setShareUrl(window.location.origin + data.share_url);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Freigabe-Link erstellen</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleShare}>
          <Form.Group className="mb-3">
            <Form.Label>Pfad</Form.Label>
            <Form.Control type="text" value={path} readOnly />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Passwort (optional)</Form.Label>
            <div className="d-flex">
              <Form.Control
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort für Zugriff"
                style={{ maxWidth: 200 }}
              />
              <Button
                variant="outline-secondary"
                size="sm"
                className="ms-2"
                type="button"
                onClick={() => setPassword(generatePassword())}
              >
                Passwort generieren
              </Button>
            </div>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Ablaufzeit (Minuten)</Form.Label>
            <InputGroup>
              <Form.Control
                type="number"
                min={1}
                value={expiresIn}
                onChange={(e) => setExpiresIn(Number(e.target.value))}
              />
              <InputGroup.Text>min</InputGroup.Text>
            </InputGroup>
          </Form.Group>
          {error && <Alert variant="danger">{error}</Alert>}
          {shareUrl && (
            <Alert variant="success" className="d-flex align-items-center justify-content-between">
              <div>
                Freigabe-Link:{" "}
                <a
                  href={
                    "/share/" +
                    (shareUrl.split("/").pop() || "")
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {window.location.origin +
                    "/share/" +
                    (shareUrl.split("/").pop() || "")}
                </a>
              </div>
              <CopyButton url={window.location.origin + "/share/" + (shareUrl.split("/").pop() || "")} />
            </Alert>
          )}
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "Erstelle..." : "Freigabe-Link erstellen"}
          </Button>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

function CopyButton({ url }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="In Zwischenablage kopieren"
      style={{
        border: "none",
        background: "none",
        cursor: "pointer",
        marginLeft: 8,
        fontSize: "1.2em",
        color: "#1b4571"
      }}
    >
      {copied ? "✅" : "📋"}
    </button>
  );
}

export default ShareForm;
