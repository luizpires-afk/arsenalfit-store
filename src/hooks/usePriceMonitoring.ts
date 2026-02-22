import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MonitoredItem = {
  id: string;
  user_id: string;
  product_id: string;
  product_title?: string | null;
  image_url?: string | null;
  baseline_price?: number | null;
  last_notified_price?: number | null;
  last_notified_at?: string | null;
  is_enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  user_email?: string | null;
};

type ProductSnapshot = {
  id: string;
  title: string;
  imageUrl?: string | null;
  price: number;
};

export function usePriceMonitoring(user?: { id: string; email?: string | null } | null) {
  const [items, setItems] = useState<Record<string, MonitoredItem>>({});
  const [loading, setLoading] = useState(false);

  const hydrate = useCallback(
    async () => {
      if (!user?.id) {
        setItems({});
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("monitored_items")
          .select("*")
          .eq("user_id", user.id);

        if (error) throw error;
        const mapped = (data as MonitoredItem[]).reduce<Record<string, MonitoredItem>>(
          (acc, item) => {
            acc[item.product_id] = item;
            return acc;
          },
          {}
        );
        setItems(mapped);
      } catch {
        setItems({});
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const isMonitoring = useCallback(
    (productId: string) => Boolean(items[productId]?.is_enabled),
    [items]
  );

  const toggleMonitoring = useCallback(
    async (product: ProductSnapshot) => {
      const existing = items[product.id];
      const enable = !existing?.is_enabled;
      const nowIso = new Date().toISOString();

      if (!user?.id) {
        return false;
      }

      try {
        if (enable) {
          const payload = {
            user_id: user.id,
            user_email: user.email ?? null,
            product_id: product.id,
            product_title: product.title,
            image_url: product.imageUrl ?? null,
            baseline_price: product.price,
            is_enabled: true,
            updated_at: nowIso,
          };
          const { data, error } = await supabase
            .from("monitored_items")
            .upsert(payload, { onConflict: "user_id,product_id" })
            .select()
            .single();

          if (error) throw error;
          const nextItems = { ...items, [product.id]: data as MonitoredItem };
          setItems(nextItems);
          return true;
        }

        if (existing?.id) {
          const { error } = await supabase
            .from("monitored_items")
            .update({ is_enabled: false, updated_at: nowIso })
            .eq("id", existing.id);
          if (error) throw error;
          const nextItems = {
            ...items,
            [product.id]: { ...existing, is_enabled: false, updated_at: nowIso },
          };
          setItems(nextItems);
          return false;
        }

        return false;
      } catch {
        await hydrate();
        return false;
      }
    },
    [items, user?.id, user?.email, hydrate]
  );

  const monitoredList = useMemo(
    () => Object.values(items).filter((item) => item.is_enabled),
    [items]
  );

  return {
    items,
    monitoredList,
    isMonitoring,
    toggleMonitoring,
    loading,
  };
}
