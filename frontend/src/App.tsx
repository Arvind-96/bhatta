import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";
import { useAuthStore } from "@/store/auth.store";

export default function App() {
  const token = useAuthStore((s) => s.token);
  return token ? <Dashboard /> : <Login />;
}
