import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Loader2, Lock, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { useLogin, type AuthSession } from "@workspace/api-client-react";
import { errorMessage } from "@/lib/api-error";
import "./lamp-login.css";

/** Messages for ?login_error=… after a Google/GitHub round trip (never says whether an account exists). */
const OAUTH_ERRORS: Record<string, string> = {
  oauth_disabled: "That sign-in option isn't set up.",
  oauth_state: "The sign-in took too long or was interrupted. Please try again.",
  oauth_failed: "We couldn't complete that sign-in. Please try again.",
  oauth_no_account: "There's no active staff account with that verified email. Ask the owner to add you.",
};

const FIREFLY_COUNT = 10;
const rand = (min: number, max: number) => Math.random() * (max - min) + min;

/** Same idea as createFireflies(): random size, speed, delay and a 5-point path in % of the panel. */
function useFireflies() {
  return useMemo(
    () =>
      Array.from({ length: FIREFLY_COUNT }, (_, i) => {
        const size = rand(3, 7);
        const style: Record<string, string> = {
          width: `${size}px`,
          height: `${size}px`,
          "--duration": `${rand(15, 65)}s`,
          "--delay": `${rand(0, 3)}s`,
        };
        for (let j = 1; j <= 5; j++) {
          style[`--x${j}`] = `${rand(0, 100)}%`;
          style[`--y${j}`] = `${rand(0, 100)}%`;
        }
        return { id: i, style: style as CSSProperties };
      }),
    [],
  );
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useInterFont() {
  useEffect(() => {
    if (document.getElementById("font-inter")) return;
    const link = document.createElement("link");
    link.id = "font-inter";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

function Lamp({ pulling }: { pulling: boolean }) {
  return (
    <svg className="lamp-svg" viewBox="0 0 240 420" aria-hidden="true">
      <defs>
        <linearGradient id="lamp-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#facc15" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#facc15" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="lamp-glow">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lamp-pool">
          <stop offset="0%" stopColor="#facc15" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* light */}
      <polygon className="lamp-cone" points="72,98 168,98 300,420 -60,420" fill="url(#lamp-cone)" />
      <ellipse className="lamp-pool" cx="120" cy="404" rx="130" ry="16" fill="url(#lamp-pool)" />
      <ellipse className="lamp-bulb-glow" cx="120" cy="98" rx="60" ry="26" fill="url(#lamp-glow)" />
      {/* stand + base */}
      <rect x="118" y="98" width="4" height="300" rx="2" fill="#27272a" />
      <ellipse cx="120" cy="402" rx="48" ry="9" fill="#18181b" stroke="#2f2f35" strokeWidth="1.5" />
      <ellipse cx="120" cy="399" rx="30" ry="4" fill="#26262b" />
      {/* bulb + shade (trapezoid) */}
      <ellipse className="lamp-bulb" cx="120" cy="99" rx="20" ry="5" />
      <g className="lamp-shade">
        <path d="M92 40 H148 L178 98 H62 Z" fill="#1c1c1f" stroke="#33333a" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M92 40 H148 L151 46 H89 Z" fill="#2a2a30" />
        <rect x="114" y="30" width="12" height="11" rx="3" fill="#27272a" />
      </g>
      {/* pull cord with bead */}
      <g className={`lamp-cord${pulling ? " is-pulling" : ""}`}>
        <line x1="160" y1="92" x2="160" y2="152" stroke="#a1a1aa" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="160" cy="158" r="6" fill="#f97316" stroke="#c2410c" strokeWidth="1.5" />
        <circle cx="158" cy="156" r="1.8" fill="#fdba74" />
      </g>
    </svg>
  );
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.63 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.55 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12S6.9 21.25 12 21.25c5.34 0 8.88-3.75 8.88-9.04 0-.6-.07-1.06-.15-1.51z" />
  </svg>
);
const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49l-.01-1.7c-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.64 1.03 2.76 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.6.69.49A10.24 10.24 0 0 0 22 12.23C22 6.58 17.52 2 12 2z" />
  </svg>
);

/** Staff sign-in: username + email + password, optional Google/GitHub for existing staff. */
export function LampLogin({ oauth, onSignedIn }: { oauth?: AuthSession["oauth"]; onSignedIn: () => void }) {
  useInterFont();
  const login = useLogin();
  const fireflies = useFireflies();
  const [on, setOn] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const timers = useRef<number[]>([]);

  const pull = (next: boolean) => {
    timers.current.forEach(clearTimeout);
    if (reducedMotion()) {
      setOn(next);
      return;
    }
    setPulling(false);
    timers.current = [
      window.setTimeout(() => setPulling(true), 10),
      window.setTimeout(() => setOn(next), 220),
      window.setTimeout(() => setPulling(false), 600),
    ];
  };

  useEffect(() => {
    // On load: pull the cord, light comes on.
    const t = window.setTimeout(() => pull(true), 350);
    // Show an error from a Google/GitHub redirect, then tidy the URL.
    const params = new URLSearchParams(window.location.search);
    const code = params.get("login_error");
    if (code) {
      setError(OAUTH_ERRORS[code] ?? OAUTH_ERRORS.oauth_failed);
      params.delete("login_error");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
    return () => {
      clearTimeout(t);
      timers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!form.username.trim() || !form.email.trim() || !form.password) {
      setError("Enter your username, email address and password.");
      return;
    }
    login.mutate(
      { data: { username: form.username.trim(), email: form.email.trim(), password: form.password } },
      {
        onSuccess: () => {
          setForm((f) => ({ ...f, password: "" }));
          onSignedIn();
        },
        onError: (err) => {
          setForm((f) => ({ ...f, password: "" }));
          setError(errorMessage(err, "Couldn't sign in. Please try again."));
        },
      },
    );
  };

  const social = (provider: "google" | "github") => {
    const label = provider === "google" ? "Google" : "GitHub";
    if (!oauth?.[provider]) {
      toast.error(`${label} sign-in isn't set up yet`);
      return;
    }
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.location.assign(`${base}/api/auth/oauth/${provider}/start`);
  };

  return (
    <div className="lamp-page" data-testid="page-login">
      <div className="lamp-card" data-light={on ? "on" : "off"} data-testid="lamp-card">
        <div className="lamp-panel">
          <div className="lamp-floor" />
          <div className="fireflies">
            {fireflies.map((f) => <span key={f.id} className="firefly" style={f.style} />)}
          </div>
          <Lamp pulling={pulling} />
        </div>

        <div className="lamp-form-wrap">
          <form className="lamp-form lamp-stagger" onSubmit={submit} noValidate>
            <h1 className="lamp-title">Welcome Back</h1>
            <p className="lamp-subtitle">Enter your details to access your account</p>
            <div className="lamp-fields">
              <label className="lamp-field">
                <User />
                <span className="sr-only">Username</span>
                <input className="lamp-input" placeholder="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} value={form.username} onChange={set("username")} aria-invalid={!!error} data-testid="input-login-username" />
              </label>
              <label className="lamp-field">
                <Mail />
                <span className="sr-only">Email Address</span>
                <input className="lamp-input" type="email" placeholder="Email Address" autoComplete="email" maxLength={254} value={form.email} onChange={set("email")} aria-invalid={!!error} data-testid="input-login-email" />
              </label>
              <label className="lamp-field">
                <Lock />
                <span className="sr-only">Password</span>
                <input
                  className="lamp-input"
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  maxLength={256}
                  value={form.password}
                  onChange={set("password")}
                  onFocus={() => pull(false)}
                  onBlur={() => pull(true)}
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  data-testid="input-login-password"
                />
              </label>
            </div>
            <button type="submit" className="lamp-submit" disabled={login.isPending} data-testid="button-login">
              {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Sign In
            </button>
            <p id="login-error" role="alert" className="lamp-error" data-testid="text-login-error" hidden={!error}>{error}</p>
            <div className="lamp-divider">Or continue with</div>
            <div className="lamp-socials">
              <button type="button" className="lamp-social" onClick={() => social("google")} data-testid="button-login-google"><GoogleIcon /> Google</button>
              <button type="button" className="lamp-social" onClick={() => social("github")} data-testid="button-login-github"><GitHubIcon /> GitHub</button>
            </div>
            <a href={import.meta.env.BASE_URL} className="lamp-back">← Back to the shop</a>
          </form>
        </div>
      </div>
    </div>
  );
}
