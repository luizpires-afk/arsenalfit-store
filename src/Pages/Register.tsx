// src/Pages/Register.tsx
import React from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function Register() {
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); 
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('fullName') as string;

    const { error } = await base44.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Sucesso! Verifique seu e-mail.');
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <form onSubmit={handleSignUp} className="flex flex-col gap-4 w-full max-w-sm">
        <input name="fullName" type="text" placeholder="Nome" required className="p-3 rounded bg-zinc-900 text-white" />
        <input name="email" type="email" placeholder="E-mail" required className="p-3 rounded bg-zinc-900 text-white" />
        <input name="password" type="password" placeholder="Senha" required className="p-3 rounded bg-zinc-900 text-white" />
        <button type="submit" className="bg-[#a3e635] p-3 rounded font-bold">CADASTRAR</button>
      </form>
    </div>
  );
}

