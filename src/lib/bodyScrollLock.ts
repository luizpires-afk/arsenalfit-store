const DATASET_KEY = "arsenalfitScrollLockCount";

const getCount = (body: HTMLBodyElement) => {
  const raw = body.dataset[DATASET_KEY];
  const value = Number(raw || "0");
  return Number.isFinite(value) ? value : 0;
};

export const lockBodyScroll = () => {
  if (typeof document === "undefined") return;
  const body = document.body;
  const count = getCount(body);
  body.dataset[DATASET_KEY] = String(count + 1);
  if (count === 0) body.style.overflow = "hidden";
};

export const unlockBodyScroll = () => {
  if (typeof document === "undefined") return;
  const body = document.body;
  const count = getCount(body);
  const next = Math.max(0, count - 1);

  if (next === 0) {
    delete body.dataset[DATASET_KEY];
    body.style.overflow = "";
    return;
  }

  body.dataset[DATASET_KEY] = String(next);
};

