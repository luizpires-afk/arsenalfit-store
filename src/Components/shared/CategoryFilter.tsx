import { useEffect, useState } from "react";
// Ajustado para a raiz onde seu client.ts reside (conforme estrutura vista antes)
import { supabase } from "@/integrations/supabase/client"; 

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface CategoryFilterProps {
  selected: string; // "all" ou o ID da categoria
  onSelect: (id: string) => void;
  allowedCategories?: string[];
}

const normalizeLabel = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const CategoryFilter = ({ selected, onSelect, allowedCategories }: CategoryFilterProps) => {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug")
        .order("name");
      
      if (error) {
        console.error("Erro ao carregar categorias:", error.message);
        return;
      }
      
      if (data) setCategories(data);
    };
    fetchCategories();
  }, []);

  const normalizedAllowed = allowedCategories?.map(normalizeLabel) ?? null;
  const visibleCategories = normalizedAllowed
    ? normalizedAllowed
        .map((label) =>
          categories.find(
            (cat) =>
              normalizeLabel(cat.name) === label ||
              normalizeLabel(cat.slug) === label ||
              normalizeLabel(cat.name).includes(label) ||
              normalizeLabel(cat.slug).includes(label),
          ),
        )
        .filter((cat): cat is Category => Boolean(cat))
    : categories;

  return (
    <div className="flex flex-nowrap md:flex-wrap gap-3 py-2 overflow-x-auto no-scrollbar">
      {/* Botão TODOS */}
      <button
        type="button"
        onClick={() => onSelect('all')}
        aria-pressed={selected === 'all'}
        className={`px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-widest transition-all border ${
          selected === 'all' 
            ? "bg-[#a3e635] text-black border-[#a3e635] shadow-[0_0_15px_rgba(163,230,53,0.3)]" 
            : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-[#a3e635]/50 hover:text-white"
        }`}
      >
        Todos
      </button>

      {/* Botões Dinâmicos */}
      {visibleCategories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onSelect(cat.id)}
          aria-pressed={selected === cat.id}
          className={`px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-widest transition-all border whitespace-nowrap ${
            selected === cat.id 
              ? "bg-[#a3e635] text-black border-[#a3e635] shadow-[0_0_15px_rgba(163,230,53,0.3)]" 
              : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-[#a3e635]/50 hover:text-white"
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
};


