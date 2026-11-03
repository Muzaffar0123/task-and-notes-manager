import { useContext } from "react";
import AuthContext from "./AuthContextStore";

export function useAuth() {
  return useContext(AuthContext);
}
