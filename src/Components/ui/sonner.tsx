// src/Components/ui/sonner.tsx
"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-zinc-900 group-[.toaster]:text-white group-[.toaster]:border-zinc-800 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-zinc-400",
          actionButton:
            "group-[.toast]:bg-[#a3e635] group-[.toast]:text-black",
          cancelButton:
            "group-[.toast]:bg-zinc-800 group-[.toast]:text-zinc-400",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };