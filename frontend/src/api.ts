export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    "/api" + path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ detail: "Backend unavailable" }));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail),
    );
  }
  return response.json() as Promise<T>;
}
export function fmt(
  value: number | null | undefined,
  style: "number" | "percent" | "money" = "number",
): string {
  if (value == null) return "—";
  if (style === "percent") return (value * 100).toFixed(1) + "%";
  if (style === "money")
    return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
