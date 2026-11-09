import { existsSync, readFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import tls from "node:tls";

/**
 * Корневой сертификат Минцифры (Russian Trusted Root CA). Без него Node не доверяет
 * сертификатам api.giga.chat и официальным адресам Яндекса: их выпустил российский УЦ,
 * а в системном хранилище доверенных сертификатов этого корня обычно нет.
 */
const CA_FILE = path.join(process.cwd(), "certs", "russian-trusted-root-ca.crt");

const CERT_ERRORS = new Set([
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
]);

let extraCa: string[] | undefined;

/** Дополнительные корни доверия из репозитория (если файл есть). */
function extraRoots(): string[] {
  if (extraCa !== undefined) return extraCa;
  extraCa = [];
  try {
    if (existsSync(CA_FILE)) extraCa = [readFileSync(CA_FILE, "utf8")];
  } catch {
    extraCa = [];
  }
  return extraCa;
}

/** Тот же запрос, но через node:https с явным списком корней. */
function httpsFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url);
  const headers: Record<string, string> = {};
  const given = init.headers;
  if (given) for (const [k, v] of Object.entries(given as Record<string, string>)) headers[k] = v;
  // Тело приводим к строке: URLSearchParams и прочее fetch умеет сам, node:https — нет.
  let body: string | undefined;
  if (typeof init.body === "string") body = init.body;
  else if (init.body instanceof URLSearchParams) body = init.body.toString();
  else if (init.body instanceof Uint8Array) body = Buffer.from(init.body).toString("binary");
  if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body));
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: init.method ?? "GET",
        headers,
        servername: u.hostname,
        ca: [...tls.rootCertificates, ...extraRoots()],
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const rh: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) if (typeof v === "string") rh[k] = v;
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 502, statusText: res.statusMessage, headers: rh }));
        });
      },
    );
    req.on("error", reject);
    init.signal?.addEventListener("abort", () => req.destroy(Object.assign(new Error("aborted"), { name: "AbortError" })));
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Запрос к провайдеру. Сначала обычный fetch; если он падает именно на недоверенном
 * сертификате, тот же запрос повторяется с корнем Минцифры. Ошибки сети и ответы
 * провайдера пробрасываются как есть.
 */
export async function secureFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    const code = (e as { cause?: { code?: string } })?.cause?.code ?? "";
    if (!CERT_ERRORS.has(code)) throw e;
    return httpsFetch(url, init);
  }
}
