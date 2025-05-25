import React, { useState } from "react";
import Login from "./Login";
import FolderBrowser from "./FolderBrowser";
import SearchBar from "./SearchBar";
import { Navbar, Container, Nav, Button, NavDropdown } from "react-bootstrap";
import { Routes, Route, useNavigate, useLocation, Navigate, Link } from "react-router-dom";
import SharesPage from "./SharesPage";
import StatsPage from "./StatsPage";

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = (newToken) => {
    setToken(newToken);
    localStorage.setItem("token", newToken);
  };

  const handleLogout = () => {
    setToken("");
    localStorage.removeItem("token");
    navigate("/browse");
  };

  const handleNavigate = (item) => {
    if (item.path) {
      let rel = item.path.replace(window.SCAN_ROOT || "/data", "");
      if (rel.startsWith("/")) rel = rel.slice(1);
      navigate("/browse" + (rel ? "/" + rel : ""));
    }
  };

  if (!token) {
    return (
      <div className="bg-light min-vh-100">
        <Login onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="bg-light min-vh-100">
      <Navbar expand="md" className="mb-3 shadow-sm bg-white border-bottom">
        <Container fluid>
          <Navbar.Brand as={Link} to="/browse" className="text-dark" style={{ fontWeight: 700, letterSpacing: 1, fontSize: "1.6rem" }}>
            MNTSRV
            <div style={{ fontSize: "0.85rem", fontWeight: 400, letterSpacing: 2, color: "#9289A6", lineHeight: 1, marginTop: 2 }}>
              MOUNT. BROWSE. SHARE.
            </div>
          </Navbar.Brand>
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/browse" className="text-dark">
              Browse
            </Nav.Link>
            <Nav.Link as={Link} to="/shares" className="text-dark">
              Shares
            </Nav.Link>
            <Nav.Link as={Link} to="/stats" className="text-dark">
              Stats
            </Nav.Link>
            <Nav.Item className="d-flex align-items-center">
              <SearchBar token={token} onNavigate={handleNavigate} />
            </Nav.Item>
          </Nav>
          <Nav className="ms-auto">
            <Button
              style={{
                borderColor: "#9289A6",
                color: "#9289A6",
                backgroundColor: "transparent"
              }}
              variant="outline-secondary"
              size="sm"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </Nav>
        </Container>
      </Navbar>
      <Container fluid="md">
        <div className="bg-white rounded shadow-sm p-3">
          <Routes>
            <Route
              path="/browse/*"
              element={
                <FolderBrowser
                  token={token}
                  key={location.pathname}
                />
              }
            />
            <Route
              path="/shares"
              element={<SharesPage token={token} />}
            />
            <Route
              path="/stats"
              element={<StatsPage token={token} />}
            />
            <Route path="*" element={<Navigate to="/browse" replace />} />
          </Routes>
        </div>
      </Container>
    </div>
  );
}

export default App;
