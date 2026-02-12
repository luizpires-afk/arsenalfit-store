import {
  useEffect,
  useMemo,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Calendar,
  LogOut,
  Mail,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/Components/ui/alert-dialog";
import { Button } from "@/Components/ui/button";
import { Tabs, TabsContent } from "@/Components/ui/tabs";
import { AccountShell, GlassCard } from "@/Components/account/AccountShell";
import { cn } from "@/lib/utils";
import { getFirstName } from "@/utils";
import { useAuth } from "@/hooks/useAuth";

type InfoItem = {
  label: string;
  value: ReactNode;
  icon: ElementType;
};

const ACCOUNT_HERO_IMAGE = "/images/account-hero.jpg";

const ACCOUNT_TABS = [
  { value: "perfil", label: "Perfil", icon: User },
  { value: "config", label: "Ajustes", icon: Settings },
];

const createBreadcrumbs = (activeLabel: string, icon: ElementType) => [
  { label: "Linha ArsenalFit" },
  { label: "Minha Conta" },
  { label: activeLabel, active: true, icon },
];

const Badge = ({
  variant = "neutral",
  children,
}: {
  variant?: "success" | "brand" | "neutral";
  children: ReactNode;
}) => {
  const styles =
    variant === "success"
      ? "border-[hsl(var(--accent-green))]/60 text-[hsl(var(--accent-green))] bg-[hsl(var(--accent-green))]/10"
      : variant === "brand"
      ? "border-[hsl(var(--accent-orange))]/60 text-[hsl(var(--accent-orange))] bg-[hsl(var(--accent-orange))]/10"
      : "border-white/15 text-white/70 bg-white/5";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em]",
        styles
      )}
    >
      {children}
    </span>
  );
};

const CardHeader = ({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ElementType;
  title: string;
  subtitle?: string;
}) => (
  <div className="flex items-center gap-3">
    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--accent-orange))]/35 bg-[hsl(var(--accent-orange))]/15 text-[hsl(var(--accent-orange))]">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">
        {title}
      </p>
      {subtitle ? (
        <p className="mt-1 text-sm text-white/70">{subtitle}</p>
      ) : null}
    </div>
  </div>
);

const InfoRow = ({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ElementType;
}) => (
  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
    {Icon ? (
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70">
        <Icon className="h-4 w-4" />
      </div>
    ) : null}
    <div>
      <p className="text-[10px] uppercase tracking-[0.25em] text-white/50">
        {label}
      </p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  </div>
);

const InfoHighlight = ({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) => (
  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
    <p className="text-[10px] uppercase tracking-[0.25em] text-white/50">
      {label}
    </p>
    <p className="mt-2 text-lg font-semibold text-white break-all">
      {value}
    </p>
  </div>
);

const DangerZone = ({
  onConfirm,
  className,
}: {
  onConfirm: () => void;
  className?: string;
}) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button
        variant="outline"
        aria-label="Encerrar sessão"
        className={cn(
          "h-10 rounded-full border-red-400/40 bg-transparent px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-200/80 transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-500/10 hover:text-red-100 hover:shadow-[0_16px_28px_rgba(0,0,0,0.35)] focus-visible:ring-2 focus-visible:ring-red-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          className
        )}
      >
        <LogOut className="h-3.5 w-3.5" /> Encerrar sessão
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent className="border border-white/10 bg-[hsl(var(--glass-bg))] text-[hsl(var(--text))] backdrop-blur-[var(--blur-glass)]">
      <AlertDialogHeader>
        <AlertDialogTitle className="text-lg">Deseja encerrar a sessão?</AlertDialogTitle>
        <AlertDialogDescription className="text-sm text-white/70">
          Você será desconectado da sua conta agora.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="gap-2 sm:gap-3">
        <AlertDialogCancel className="rounded-full border border-white/15 bg-transparent text-[hsl(var(--text))] hover:bg-white/5">
          Cancelar
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          className="rounded-full bg-red-500/90 text-white hover:bg-red-500"
        >
          Encerrar
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const SkeletonLine = ({ className }: { className?: string }) => (
  <div
    className={cn("h-3 w-24 rounded-full bg-white/10 animate-pulse", className)}
  />
);

const SkeletonBlock = ({ className }: { className?: string }) => (
  <div className={cn("rounded-2xl bg-white/10 animate-pulse", className)} />
);

const AccountSkeleton = () => (
  <div className="min-h-screen account-theme bg-[hsl(var(--bg))] text-[hsl(var(--text))]">
    <Tabs defaultValue="perfil">
      <AccountShell
        onBack={() => {}}
        heroImage={ACCOUNT_HERO_IMAGE}
        breadcrumbItems={createBreadcrumbs("Perfil", User)}
        title="Minha Conta"
        subtitle="Gerencie seus dados e preferências"
        tabs={ACCOUNT_TABS}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlassCard className="p-6 sm:p-7 space-y-6">
            <div className="flex items-center gap-4">
              <SkeletonBlock className="h-14 w-14" />
              <div className="space-y-2">
                <SkeletonLine className="w-48" />
                <SkeletonLine className="w-28" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
            </div>
          </GlassCard>
          <GlassCard className="p-6 sm:p-7 space-y-4">
            <SkeletonLine className="w-28" />
            <SkeletonBlock className="h-16" />
          </GlassCard>
          <GlassCard className="p-6 sm:p-7 space-y-4">
            <SkeletonLine className="w-28" />
            <SkeletonBlock className="h-16" />
            <SkeletonBlock className="h-16" />
          </GlassCard>
          <GlassCard className="p-6 sm:p-7 space-y-4">
            <SkeletonLine className="w-28" />
            <SkeletonBlock className="h-10 w-full" />
          </GlassCard>
        </div>
      </AccountShell>
    </Tabs>
  </div>
);

export default function Profile() {
  const navigate = useNavigate();
  const { user, loading, isAdmin, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("perfil");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("account-theme");
    const previousBackground = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "hsl(220 20% 8%)";
    const href = ACCOUNT_HERO_IMAGE;
    const selector = `link[rel="preload"][as="image"][href="${href}"]`;
    if (!document.querySelector(selector)) {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = href;
      document.head.appendChild(link);
    }
    const img = new Image();
    img.src = href;

    return () => {
      document.body.classList.remove("account-theme");
      document.body.style.backgroundColor = previousBackground;
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, user, navigate]);

  if (loading) {
    return <AccountSkeleton />;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "N/A";

  const firstName = getFirstName(user) || "Atleta";
  const handle = user?.email ? `@${user.email.split("@")[0]}` : "@arsenalfit";

  const accountItems = useMemo<InfoItem[]>(
    () => [
      {
        label: "Membro desde",
        value: createdAt,
        icon: Calendar,
      },
      {
        label: "Status",
        value: user ? "Ativo" : "—",
        icon: ShieldCheck,
      },
    ],
    [createdAt, user]
  );

  const breadcrumbItems = useMemo(
    () =>
      createBreadcrumbs(
        activeTab === "config" ? "Ajustes" : "Perfil",
        activeTab === "config" ? Settings : User
      ),
    [activeTab]
  );

  const cardMotion = (index: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.32, delay: index * 0.06 },
        };

  return (
    <div className="min-h-screen account-theme bg-[hsl(var(--bg))] text-[hsl(var(--text))]">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <AccountShell
          onBack={() => navigate(-1)}
          heroImage={ACCOUNT_HERO_IMAGE}
          breadcrumbItems={breadcrumbItems}
          title="Minha Conta"
          subtitle="Gerencie seus dados e preferências"
          tabs={ACCOUNT_TABS}
        >
          <TabsContent value="perfil" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <motion.div {...cardMotion(0)}>
                <GlassCard className="h-full p-6 sm:p-7 space-y-6">
                  <CardHeader
                    icon={User}
                    title="Identidade"
                    subtitle="Perfil do atleta"
                  />
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[hsl(var(--accent-orange))]/40 bg-[hsl(var(--accent-orange))]/15 text-[hsl(var(--accent-orange))]">
                      <User className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-2xl font-semibold text-[hsl(var(--text))]">
                          {firstName}
                        </p>
                        <Badge variant="success">
                          <ShieldCheck className="h-3.5 w-3.5" /> Verificado
                        </Badge>
                        {isAdmin ? <Badge variant="brand">Admin</Badge> : null}
                      </div>
                      <p className="text-sm text-white/60">{handle}</p>
                    </div>
                  </div>
                  <p className="text-sm text-white/60 max-w-2xl">
                    Sua identidade dentro do ArsenalFit, pronta para personalizar
                    sua experiência com máxima performance.
                  </p>
                </GlassCard>
              </motion.div>

              <motion.div {...cardMotion(1)}>
                <GlassCard className="h-full p-6 sm:p-7 space-y-5">
                  <CardHeader
                    icon={Mail}
                    title="Contato"
                    subtitle="Onde falamos com você"
                  />
                  <InfoHighlight label="E-mail" value={user?.email || "—"} />
                </GlassCard>
              </motion.div>

              <motion.div {...cardMotion(2)}>
                <GlassCard className="h-full p-6 sm:p-7 space-y-5">
                  <CardHeader
                    icon={Calendar}
                    title="Conta"
                    subtitle="Status e datas importantes"
                  />
                  <div className="space-y-3">
                    {accountItems.map((item) => (
                      <InfoRow key={item.label} {...item} />
                    ))}
                  </div>
                </GlassCard>
              </motion.div>

              <motion.div {...cardMotion(3)}>
                <GlassCard className="h-full p-6 sm:p-7 space-y-5">
                  <CardHeader
                    icon={LogOut}
                    title="Segurança"
                    subtitle="Controle rápido da sessão"
                  />
                  <p className="text-sm text-white/60">
                    Use o botão abaixo para encerrar sua sessão de forma segura.
                  </p>
                  <DangerZone
                    onConfirm={handleSignOut}
                    className="w-full sm:w-auto"
                  />
                </GlassCard>
              </motion.div>
            </div>
          </TabsContent>

          <TabsContent value="config" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <motion.div {...cardMotion(0)}>
                <GlassCard className="h-full p-6 sm:p-7 space-y-4">
                  <CardHeader
                    icon={Settings}
                    title="Preferências"
                    subtitle="Personalize sua experiência"
                  />
                  <p className="text-sm text-white/70">
                    Em breve você poderá ajustar notificações, segurança e
                    personalização do ArsenalFit com a mesma precisão do seu
                    treino.
                  </p>
                </GlassCard>
              </motion.div>
              <motion.div {...cardMotion(1)}>
                <GlassCard className="h-full p-6 sm:p-7 space-y-4">
                  <CardHeader
                    icon={ShieldCheck}
                    title="Segurança"
                    subtitle="Proteção e privacidade"
                  />
                  <p className="text-sm text-white/70">
                    Estamos preparando controles avançados para proteção da
                    conta, sessões ativas e autenticação reforçada.
                  </p>
                </GlassCard>
              </motion.div>
            </div>
          </TabsContent>
        </AccountShell>
      </Tabs>
    </div>
  );
}
