// Shared error toast, used by dev.js/login.js so a failed action (missing
// required field, RLS denial, network error, DB constraint violation) is
// always visible with its actual reason instead of failing silently.
const TOAST_MS = 6000;

let container = null;

function getContainer() {
  if (container) return container;
  container = document.createElement("div");
  container.className = "error-toast-container";
  document.body.appendChild(container);
  return container;
}

export function showError(message) {
  const toast = document.createElement("div");
  toast.className = "error-toast";
  toast.innerHTML = `<span>${message}</span><button class="error-toast-close" aria-label="Dismiss">×</button>`;
  toast.querySelector(".error-toast-close").addEventListener("click", () => toast.remove());
  getContainer().appendChild(toast);
  setTimeout(() => toast.remove(), TOAST_MS);
}

// Catches any Supabase/RLS/network error that reaches the browser without
// being caught locally (most create/delete/update handlers in dev.js and
// login.js only wrap their button's disabled state in try/finally, no
// catch) — this is the safety net for "why didn't that just work", not a
// replacement for the specific pre-flight messages at each form's guard.
export function installGlobalErrorToasts() {
  window.addEventListener("unhandledrejection", (e) => {
    showError(e.reason?.message ?? String(e.reason));
  });
}
