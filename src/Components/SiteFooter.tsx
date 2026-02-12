import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type SiteFooterProps = {
  className?: string;
};

export function SiteFooter({ className }: SiteFooterProps) {
  return (
    <footer
      className={cn(
        "mt-12 border-t border-black/5 bg-white/80 backdrop-blur-sm",
        className
      )}
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-7 text-center">
        <nav className="inline-flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-zinc-600">
          <Link
            to="/termos"
            className="px-2 py-2 hover:text-[#ff7a00] transition-colors"
          >
            Termos
          </Link>
          <span aria-hidden="true" className="text-zinc-400">
            ·
          </span>
          <Link
            to="/privacidade"
            className="px-2 py-2 hover:text-[#ff7a00] transition-colors"
          >
            Privacidade
          </Link>
          <span aria-hidden="true" className="text-zinc-400">
            ·
          </span>
          <Link
            to="/afiliados"
            className="px-2 py-2 hover:text-[#ff7a00] transition-colors"
          >
            Afiliados
          </Link>
        </nav>
        <p className="text-xs text-zinc-500">© 2026 ArsenalFit.</p>
      </div>
    </footer>
  );
}
