import { useEffect, type RefObject } from "react";

export function useSyncedHeight(
  sourceRef: RefObject<HTMLElement>,
  targetRef: RefObject<HTMLElement>,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) {
      if (targetRef.current) {
        targetRef.current.style.minHeight = "";
      }
      return;
    }

    if (typeof window === "undefined") return;

    let frameId: number | null = null;
    let timeoutId: number | null = null;

    const updateHeight = () => {
      if (!sourceRef.current || !targetRef.current) return;
      const nextHeight = sourceRef.current.offsetHeight;
      targetRef.current.style.minHeight = nextHeight ? `${nextHeight}px` : "";
    };

    const scheduleUpdate = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        if (frameId) window.cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(updateHeight);
      }, 80);
    };

    updateHeight();

    const observer = new ResizeObserver(scheduleUpdate);
    if (sourceRef.current) observer.observe(sourceRef.current);

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);

    return () => {
      observer.disconnect();
      if (timeoutId) window.clearTimeout(timeoutId);
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      if (targetRef.current) {
        targetRef.current.style.minHeight = "";
      }
    };
  }, [enabled, sourceRef, targetRef]);
}
