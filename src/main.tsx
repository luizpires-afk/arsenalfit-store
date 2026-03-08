import React from "react"
import ReactDOM from "react-dom/client"
import "./index.css"

declare global {
  var toNumber: ((value: unknown) => unknown) | undefined
}

const rootElement = document.getElementById("root")
let appBootstrapped = false

if (typeof globalThis.toNumber !== "function") {
  globalThis.toNumber = (value: unknown) => {
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value)
      if (!Number.isNaN(parsed)) return parsed
    }
    return value
  }
}

const renderFatalFallback = (title: string, message: string) => {
  if (!rootElement) return
  rootElement.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#fafafa;">
      <section style="max-width:720px;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;font-family:Inter,system-ui,-apple-system,sans-serif;">
        <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">${title}</h1>
        <p style="margin:0 0 16px;color:#4b5563;line-height:1.5;word-break:break-word;">${message}</p>
        <button onclick="window.location.reload()" style="height:40px;padding:0 14px;border-radius:10px;border:1px solid #d1d5db;background:#fff;color:#111827;font-weight:600;cursor:pointer;">Recarregar página</button>
      </section>
    </main>
  `
}

window.addEventListener("error", (event) => {
  if (appBootstrapped) return
  const errorMessage = event?.error?.message || event.message || "Erro inesperado na inicialização do app."
  renderFatalFallback("Falha ao carregar o site", errorMessage)
})

window.addEventListener("unhandledrejection", (event) => {
  if (appBootstrapped) return
  const reason = event.reason
  const reasonMessage = typeof reason === "string" ? reason : reason?.message || "Promise rejeitada sem tratamento."
  const isLikelyBootstrapFailure = /chunk|dynamic import|loading css chunk|failed to fetch dynamically imported module|importing a module script failed/i.test(
    reasonMessage,
  )
  if (!isLikelyBootstrapFailure) return
  renderFatalFallback("Falha ao carregar o site", reasonMessage)
})

const bootstrap = async () => {
  if (!rootElement) {
    throw new Error("Elemento root não encontrado")
  }

  // Load the app lazily so module-evaluation failures are caught and surfaced.
  const { default: App } = await import("@/app/App")

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
  appBootstrapped = true
}

bootstrap().catch((error: any) => {
  renderFatalFallback("Falha ao carregar o site", error?.message || "Erro fatal durante a renderização inicial")
})
