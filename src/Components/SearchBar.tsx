import React from 'react';
import { Input } from "@/Components/ui/input";
import { Search } from "lucide-react";

export default function SearchBar({ value, onChange }) {
  return (
    <div className="relative max-w-md mx-auto">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
      <Input
        type="text"
        placeholder="Buscar produtos..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Buscar produtos"
        className="w-full pl-12 pr-4 h-12 rounded-full border-zinc-200 bg-white focus:border-zinc-400 focus:ring-zinc-400 text-zinc-900 placeholder:text-zinc-400"
      />
    </div>
  );
}
