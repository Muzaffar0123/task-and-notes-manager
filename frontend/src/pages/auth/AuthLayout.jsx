import { ListTodo, ShieldCheck, Zap } from "lucide-react";
import AuthAnimation from "./AuthAnimation";
import "./Auth.css";

export default function AuthLayout({
  children,
  mode = "login",
}) {
  const isRegister = mode === "register";

  return (
    <main className="auth-page">
      {/* Left: Authentication form */}
      <section className="auth-form-panel">
        <div className="auth-form-container">
          <a href="/" className="auth-brand">
            <span className="auth-brand-icon">
              <ListTodo size={24} />
            </span>

            <span>
              Task<span>Flow</span>
            </span>
          </a>

          <div className="auth-heading">
            <span className="auth-eyebrow">
              {isRegister ? "GET STARTED" : "WELCOME BACK"}
            </span>

            <h1>
              {isRegister
                ? "Create your workspace."
                : "Good to see you again."}
            </h1>

            <p>
              {isRegister
                ? "Bring your tasks, notes and ideas together in one organized space."
                : "Sign in to pick up where you left off and keep your work moving."}
            </p>
          </div>

          {children}

          <div className="auth-security">
            <ShieldCheck size={15} />
            <span>Your workspace is protected and secure.</span>
          </div>
        </div>

        <footer className="auth-footer">
          © {new Date().getFullYear()} TaskFlow. All rights reserved.
        </footer>
      </section>

      {/* Right: Animated productivity workspace */}
      <section className="auth-visual-panel">
        <AuthAnimation />

        <div className="auth-visual-copy">
          <span className="auth-visual-label">
            <Zap size={14} />
            YOUR PRODUCTIVITY SPACE
          </span>

          <h2>
            Less chaos.
            <br />
            <span>More meaningful work.</span>
          </h2>

          <p>
            Organize your tasks, capture your ideas and bring
            everything together with TaskFlow.
          </p>

          <div className="auth-visual-dots">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="auth-visual-footer">
          PLAN SMARTER <span /> WORK BETTER <span /> STAY FOCUSED
        </div>
      </section>
    </main>
  );
}