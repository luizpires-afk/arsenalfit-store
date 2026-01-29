import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Tag, Save, X } from "lucide-react";
import { Button } from "@/Components/ui/button";
import { useToast } from "@/Components/ui/use-toast";

export const CategoryManager = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const { toast } = useToast();

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('name');
    if (data) setCategories(data);
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = newCatName.toLowerCase().trim().replace(/\s+/g, '-');
    
    const { error } = await supabase.from('categories').insert([{ name: newCatName, slug }]);
    
    if (error) {
      toast({ title: "Erro", description: "Categoria já existe ou erro no banco.", variant: "destructive" });
    } else {
      toast({ title: "Sucesso", description: "Categoria criada!" });
      setNewCatName("");
      fetchCategories();
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Ao deletar a categoria, produtos vinculados ficarão sem categoria. Continuar?")) {
      await supabase.from('categories').delete().eq('id', id);
      fetchCategories();
      toast({ title: "Excluída" });
    }
  };

  return (
    <div className="bg-card border border-border rounded-[32px] p-8 text-white">
      <div className="flex items-center gap-2 mb-8">
        <Tag className="text-primary h-6 w-6" />
        <h2 className="text-2xl font-display font-black uppercase italic tracking-tighter">Gerenciar Categorias</h2>
      </div>

      <form onSubmit={handleAddCategory} className="flex gap-4 mb-8">
        <input 
          required
          placeholder="Nome da nova categoria..." 
          className="flex-1 bg-muted border border-border rounded-2xl p-4 outline-none focus:border-primary transition-all font-bold"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
        />
        <Button type="submit" className="bg-primary text-black font-black px-8 rounded-2xl uppercase italic">
          <Plus className="mr-2" size={20} /> Adicionar
        </Button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between bg-muted/30 p-4 rounded-2xl border border-border group hover:border-primary/50 transition-all">
            <span className="font-bold uppercase text-xs tracking-widest">{cat.name}</span>
            <button 
              onClick={() => handleDelete(cat.id)}
              className="text-muted-foreground hover:text-destructive transition-colors p-2"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};



