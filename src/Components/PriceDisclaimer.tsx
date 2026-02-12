import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PriceDisclaimerProps {
  lastUpdated: Date | null;
  className?: string;
}

const formatLastUpdated = (lastUpdated: Date | null) => {
  if (!lastUpdated) return null;
  if (!isValid(lastUpdated)) return null;
  return format(lastUpdated, "dd/MM 'às' HH:mm", { locale: ptBR });
};

export const PriceDisclaimer = ({ lastUpdated, className }: PriceDisclaimerProps) => {
  const formatted = formatLastUpdated(lastUpdated);
  const text = formatted
    ? `Preço pode variar. Última atualização em ${formatted}`
    : "Preço pode variar. Atualização em breve";

  return (
    <span className={className || "text-[10px] text-zinc-500"}>{text}</span>
  );
};
