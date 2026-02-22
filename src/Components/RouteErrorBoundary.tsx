import React from "react";
import { Link } from "react-router-dom";

type RouteErrorBoundaryProps = {
  children: React.ReactNode;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Erro inesperado ao abrir esta página.",
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("route_render_error", { error, info });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900">Não foi possível abrir este produto</h1>
          <p className="mt-2 text-sm text-zinc-600 break-words">{this.state.message}</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link
              to="/"
              className="inline-flex h-10 items-center rounded-lg bg-lime-400 px-4 text-sm font-semibold text-zinc-900"
            >
              Voltar para a Home
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-700"
            >
              Recarregar
            </button>
          </div>
        </div>
      </main>
    );
  }
}

export default RouteErrorBoundary;
