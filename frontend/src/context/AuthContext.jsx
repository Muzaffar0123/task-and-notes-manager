import {
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { getApiError } from "../services/api";
import AuthContext from "./AuthContextStore";

function readSavedUser() {
  try {
    const savedUser = localStorage.getItem("taskflow_user");
    return savedUser ? JSON.parse(savedUser) : null;
  } catch {
    localStorage.removeItem("taskflow_user");
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSavedUser);
  const [token, setToken] = useState(
    () => localStorage.getItem("taskflow_token")
  );

  const navigate = useNavigate();

  useEffect(() => {
    function clearInvalidSession() {
      localStorage.removeItem("taskflow_user");
      localStorage.removeItem("taskflow_token");
      setUser(null);
      setToken(null);
      navigate("/login", { replace: true });
    }

    window.addEventListener("taskflow:authentication-invalid", clearInvalidSession);
    return () => window.removeEventListener("taskflow:authentication-invalid", clearInvalidSession);
  }, [navigate]);

  function saveSession(userData, accessToken) {
    localStorage.setItem("taskflow_user", JSON.stringify(userData));
    localStorage.setItem("taskflow_token", accessToken);

    setUser(userData);
    setToken(accessToken);
    navigate("/dashboard", { replace: true });
  }

  async function signIn(email, password) {
    try {
      const response = await api.post("/api/users/login", {
        email: email.trim(),
        password,
      });

      const { token: accessToken, user: userData } = response.data;

      if (!accessToken || !userData) {
        throw new Error("The server returned an incomplete login response.");
      }

      saveSession(userData, accessToken);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response
          ? getApiError(error)
          : error.message || getApiError(error),
      };
    }
  }

  async function signUp(name, email, password) {
    try {
      await api.post("/api/users/register", {
        name: name.trim(),
        email: email.trim(),
        password,
      });

      // Registration creates the account; login returns the JWT.
      return await signIn(email, password);
    } catch (error) {
      return {
        success: false,
        message: getApiError(error),
      };
    }
  }
  function updateUser(userData) {
  setUser((previousUser) => {
    const updatedUser = {
      ...previousUser,
      ...userData,
    };

    localStorage.setItem("taskflow_user", JSON.stringify(updatedUser));

    return updatedUser;
  });
}

  async function logout() {
    try {
      if (localStorage.getItem("taskflow_token")) {
        await api.post("/api/users/logout");
      }
    } catch {
      // Clear local credentials even if the server is unreachable or the token expired.
    }
    localStorage.removeItem("taskflow_user");
    localStorage.removeItem("taskflow_token");

    setUser(null);
    setToken(null);
    navigate("/login", { replace: true });
  }

  const value = {
    user,
    token,
    signIn,
    signUp,
    updateUser,
    logout,
    isAuthenticated: Boolean(user && token),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
