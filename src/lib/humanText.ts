export const decodeUnicodeEscapes = (value: string) =>
  value.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );

export const safeMessage = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return decodeUnicodeEscapes(trimmed);
};

export const safeErrorMessage = (error: unknown, fallback: string) => {
  if (!error) return fallback;

  if (typeof error === "string") {
    return safeMessage(error, fallback);
  }

  const message = (error as any)?.message;
  if (typeof message === "string") {
    return safeMessage(message, fallback);
  }

  return fallback;
};

