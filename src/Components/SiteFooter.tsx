import { Link } from "react-router-dom";
import { Instagram } from "lucide-react";
import { cn } from "@/lib/utils";

type SiteFooterProps = {
  className?: string;
};

export function SiteFooter({ className }: SiteFooterProps) {
  return (
    <footer
      className={cn(
        "mt-12 border-t border-black/5 bg-white/90 backdrop-blur-sm",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to="/"
            className="inline-flex items-center rounded-lg py-1 text-[13px] font-black uppercase tracking-[0.24em] text-zinc-900 hover:text-[#ff7a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a00]/40"
            aria-label="ArsenalFit - voltar para início"
          >
            ARSENAL<span className="text-[#ff7a00]">FIT</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1 text-sm font-medium text-zinc-600">
            <Link
              to="/termos"
              className="rounded-md px-3 py-2 hover:text-[#ff7a00] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a00]/40"
            >
              Termos
            </Link>
            <span aria-hidden="true" className="px-1 text-zinc-400">
              ·
            </span>
            <Link
              to="/privacidade"
              className="rounded-md px-3 py-2 hover:text-[#ff7a00] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a00]/40"
            >
              Privacidade
            </Link>
            <span aria-hidden="true" className="px-1 text-zinc-400">
              ·
            </span>
            <Link
              to="/afiliados"
              className="rounded-md px-3 py-2 hover:text-[#ff7a00] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a00]/40"
            >
              Afiliados
            </Link>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-black/5 pt-3 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ArsenalFit.</p>
          <a
            href="https://instagram.com/arsenalfit"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md py-2 text-zinc-600 hover:text-[#ff7a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a00]/40"
            aria-label="Instagram ArsenalFit"
          >
            <Instagram className="h-4 w-4" />
            Instagram
          </a>
        </div>
      </div>
    </footer>
  );
}
