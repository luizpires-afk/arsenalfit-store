import React from "react"
import ReactDOM from "react-dom/client"
import App from "@/app/App"
import "./index.css"

const rootElement = document.getElementById("root")

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
  const errorMessage = event?.error?.message || event.message || "Erro inesperado na inicialização do app."
  renderFatalFallback("Falha ao carregar o site", errorMessage)
})

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason
  const reasonMessage = typeof reason === "string" ? reason : reason?.message || "Promise rejeitada sem tratamento."
  renderFatalFallback("Falha ao carregar o site", reasonMessage)
})

try {
  if (!rootElement) {
    throw new Error("Elemento root não encontrado")
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
} catch (error: any) {
  renderFatalFallback("Falha ao carregar o site", error?.message || "Erro fatal durante a renderização inicial")
}
