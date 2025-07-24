import React, { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Alert, Badge, Card } from "react-bootstrap";

function UserManagement({ token, authFetch }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    role: "standard"
  });

  const roleColors = {
    admin: "danger",
    power: "warning", 
    standard: "primary",
    readonly: "secondary"
  };

  const roleDescriptions = {
    admin: "Full access + user management",
    power: "Browse, download, share, delete, rename",
    standard: "Browse, download, share",
    readonly: "Browse and download only"
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await authFetch("/api/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        setError("Failed to fetch users");
      }
    } catch (err) {
      if (err.message !== "Authentication failed") {
        setError("Error fetching users");
      }
    }
    setLoading(false);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const formBody = new URLSearchParams();
      formBody.append("username", formData.username);
      formBody.append("password", formData.password);
      formBody.append("role", formData.role);

      const response = await authFetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formBody
      });

      if (response.ok) {
        setShowModal(false);
        setFormData({ username: "", password: "", role: "standard" });
        fetchUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.detail || "Failed to create user");
      }
    } catch (err) {
      if (err.message !== "Authentication failed") {
        setError("Error creating user");
      }
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      const formBody = new URLSearchParams();
      if (formData.role) formBody.append("role", formData.role);
      if (formData.password) formBody.append("password", formData.password);

      const response = await authFetch(`/api/users/${editingUser.username}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formBody
      });

      if (response.ok) {
        setShowModal(false);
        setEditingUser(null);
        setFormData({ username: "", password: "", role: "standard" });
        fetchUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.detail || "Failed to update user");
      }
    } catch (err) {
      if (err.message !== "Authentication failed") {
        setError("Error updating user");
      }
    }
  };

  const handleDeleteUser = async (username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      const response = await authFetch(`/api/users/${username}`, {
        method: "DELETE"
      });

      if (response.ok) {
        fetchUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.detail || "Failed to delete user");
      }
    } catch (err) {
      if (err.message !== "Authentication failed") {
        setError("Error deleting user");
      }
    }
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({ username: "", password: "", role: "standard" });
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormData({ username: user.username, password: "", role: user.role });
    setShowModal(true);
  };

  if (loading) return <div>Loading users...</div>;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>User Management</h2>
        <Button variant="primary" onClick={openCreateModal}>
          Create User
        </Button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <Card.Body>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Permissions</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.username}>
                  <td>{user.username}</td>
                  <td>
                    <Badge bg={roleColors[user.role]}>{user.role}</Badge>
                  </td>
                  <td>
                    <small className="text-muted">{roleDescriptions[user.role]}</small>
                  </td>
                  <td>{user.created_at}</td>
                  <td>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="me-2"
                      onClick={() => openEditModal(user)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDeleteUser(user.username)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editingUser ? "Edit User" : "Create User"}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={editingUser ? handleUpdateUser : handleCreateUser}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required={!editingUser}
                disabled={!!editingUser}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Password {editingUser && "(leave empty to keep current)"}</Form.Label>
              <Form.Control
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!editingUser}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Role</Form.Label>
              <Form.Select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="readonly">Read-Only - Browse and download only</option>
                <option value="standard">Standard - Browse, download, share</option>
                <option value="power">Power User - Browse, download, share, delete, rename</option>
                <option value="admin">Admin - Full access + user management</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editingUser ? "Update User" : "Create User"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

export default UserManagement;
