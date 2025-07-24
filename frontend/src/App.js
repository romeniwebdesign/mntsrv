import React, { useState } from "react";
import Login from "./Login";
import FolderBrowser from "./FolderBrowser";
import SearchBar from "./SearchBar";
import { Navbar, Container, Nav, Button, NavDropdown } from "react-bootstrap";
import { Routes, Route, useNavigate, useLocation, Navigate, Link } from "react-router-dom";
import SharesPage from "./SharesPage";
import StatsPage from "./StatsPage";
import UserManagement from "./UserManagement";

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = (newToken) => {
    setToken(newToken);
    localStorage.setItem("token", newToken);
    
    // Update user state from localStorage after login
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  };

  const handleLogout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/browse");
  };

  // Global error handler for invalid sessions
  const handleAuthError = () => {
    console.log("Authentication error detected, logging out...");
    handleLogout();
  };

  // Create a fetch wrapper that handles auth errors
  const authFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      handleAuthError();
      throw new Error("Authentication failed");
    }

    return response;
  };

  // Make authFetch available globally
  React.useEffect(() => {
    window.authFetch = authFetch;
    window.handleAuthError = handleAuthError;
  }, [token]);

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
            {user && user.role === "admin" && (
              <Nav.Link as={Link} to="/users" className="text-dark">
                Users
              </Nav.Link>
            )}
            <Nav.Item className="d-flex align-items-center">
              <SearchBar token={token} onNavigate={handleNavigate} authFetch={authFetch} />
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
                  user={user}
                  authFetch={authFetch}
                  key={location.pathname}
                />
              }
            />
            <Route
              path="/shares"
              element={<SharesPage token={token} user={user} authFetch={authFetch} />}
            />
            <Route
              path="/stats"
              element={<StatsPage token={token} authFetch={authFetch} />}
            />
            {user && user.role === "admin" && (
              <Route
                path="/users"
                element={<UserManagement token={token} authFetch={authFetch} />}
              />
            )}
            <Route path="*" element={<Navigate to="/browse" replace />} />
          </Routes>
        </div>
      </Container>
    </div>
  );
}

export default App;
