import React, { useState } from "react";
import { Form, Button, Alert, Container, Row, Col, Card } from "react-bootstrap";

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const form = new URLSearchParams();
      form.append("username", username);
      form.append("password", password);
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      if (!res.ok) {
        throw new Error("Login fehlgeschlagen");
      }
      const data = await res.json();
      // Store user info in localStorage
      localStorage.setItem("user", JSON.stringify(data.user));
      onLogin(data.access_token);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <Container className="pt-4">
      <Row className="justify-content-md-center">
        <Col md={4}>
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
          <Card>
            <Card.Body>
              <Card.Title>Login</Card.Title>
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3" controlId="formUsername">
                  <Form.Label>Benutzername</Form.Label>
                  <Form.Control
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3" controlId="formPassword">
                  <Form.Label>Passwort</Form.Label>
                  <Form.Control
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Form.Group>
                {error && <Alert variant="danger">{error}</Alert>}
                <Button variant="primary" type="submit" disabled={loading}>
                  {loading ? "Lädt..." : "Login"}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default Login;
