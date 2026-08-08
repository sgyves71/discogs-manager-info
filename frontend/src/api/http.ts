export async function requestJson<T>(url: string, options?: RequestInit, fallbackMessage = 'The request failed.'): Promise<T> {
  const response = await fetch(url, options);
  const text = await response.text();
  let data: (T & { error?: string }) | null = null;
  try { data = text ? JSON.parse(text) as T & { error?: string } : null; } catch { /* handled by the status check */ }
  if (!response.ok) throw new Error(data?.error || fallbackMessage);
  if (!data) throw new Error(fallbackMessage);
  return data;
}

export const jsonRequest = (method: 'POST' | 'PUT' | 'PATCH', body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
