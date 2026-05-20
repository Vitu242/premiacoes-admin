"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  targetRef: React.RefObject<HTMLElement | null>;
  caption?: string;
  filename?: string;
  className?: string;
  label?: string;
}

/**
 * Gera PNG do bilhete e abre o share-sheet (nativo se disponível; senão um próprio).
 *
 * Estratégia:
 *   1) Clona o bilhete em um container offscreen com fundo branco e fonte system para
 *      isolar de estilos dark-mode / utilitários do Tailwind.
 *   2) Tenta gerar PNG em cascata: modern-screenshot → html-to-image.
 *   3) Compartilhamento:
 *      - Web Share API com arquivos (Android Chrome HTTPS) → abre share-sheet nativo.
 *      - Sem files: tenta Web Share só com texto.
 *      - Sem Web Share: abre nosso próprio "sheet" com WhatsApp / Telegram / Baixar.
 */
export default function CompartilharBilheteBtn({
  targetRef,
  caption = "",
  filename = "bilhete.png",
  className = "",
  label = "Enviar",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | { url: string; file: File; blob: Blob }>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  /** Cria um clone isolado offscreen para garantir captura limpa. */
  const montarCloneOffscreen = (el: HTMLElement): { holder: HTMLDivElement; clone: HTMLElement } => {
    const holder = document.createElement("div");
    holder.style.cssText = [
      "position: fixed",
      "top: 0",
      "left: -10000px",
      "z-index: -1",
      "background: #ffffff",
      "padding: 16px",
      "color: #0f172a",
      "font-family: system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
      "color-scheme: light",
    ].join(";");
    holder.setAttribute("data-share-clone", "1");

    const clone = el.cloneNode(true) as HTMLElement;
    // 390px evita cortes laterais em alguns WebViews/Chrome Android ao
    // rasterizar layouts com bordas/arredondamentos. O componente segue 100%
    // interno, então a imagem final fica completa e ainda legível.
    // 380px casa com o maxWidth do BilheteDetalhado.tsx. Mantém o conteúdo
    // dentro de 380 + padding do holder — sem cortes laterais em WhatsApp.
    clone.style.width = "380px";
    clone.style.maxWidth = "380px";
    clone.style.boxSizing = "border-box";
    clone.style.margin = "0 auto";
    clone.style.overflow = "visible";
    holder.appendChild(clone);
    document.body.appendChild(holder);

    return { holder, clone };
  };

  const aguardarRender = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

  /** Gera Blob PNG do alvo, tentando várias estratégias. */
  const gerarBlobPng = async (el: HTMLElement): Promise<Blob> => {
    const { holder, clone } = montarCloneOffscreen(el);
    try {
      await aguardarRender();
      await new Promise<void>((r) => setTimeout(r, 100));

      const opts = {
        scale: 2,
        backgroundColor: "#ffffff",
        font: false as const,
        drawImageInterval: 120,
        style: {
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
          color: "#0f172a",
        },
        filter: (node: Node) => {
          const tag = (node as HTMLElement).tagName?.toLowerCase?.();
          return tag !== "script" && tag !== "noscript";
        },
      };

      try {
        const ms = await import("modern-screenshot");
        const blob = await ms.domToBlob(clone, opts);
        if (blob && blob.size > 900) return blob;
      } catch (e) {
        console.warn("[Compartilhar] modern-screenshot domToBlob falhou:", e);
      }

      try {
        const ms = await import("modern-screenshot");
        const canvas = await ms.domToCanvas(clone, opts);
        const b = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((x) => resolve(x), "image/png", 1)
        );
        if (b && b.size > 900) return b;
      } catch (e) {
        console.warn("[Compartilhar] modern-screenshot domToCanvas falhou:", e);
      }

      try {
        const hti = await import("html-to-image");
        const b = await hti.toBlob(clone, {
          pixelRatio: 2,
          cacheBust: true,
          skipFonts: true,
          backgroundColor: "#ffffff",
          style: opts.style,
          filter: opts.filter,
        });
        if (b && b.size > 900) return b;
      } catch (e) {
        console.warn("[Compartilhar] html-to-image toBlob falhou:", e);
      }

      try {
        const hti = await import("html-to-image");
        const dataUrl = await hti.toPng(clone, {
          pixelRatio: 2,
          cacheBust: true,
          skipFonts: true,
          backgroundColor: "#ffffff",
          style: opts.style,
        });
        if (dataUrl && dataUrl.length > 1200) {
          const r = await fetch(dataUrl);
          const b = await r.blob();
          if (b.size > 900) return b;
        }
      } catch (e) {
        console.warn("[Compartilhar] html-to-image toPng falhou:", e);
      }

      throw new Error("Não foi possível gerar PNG do bilhete");
    } finally {
      try { document.body.removeChild(holder); } catch {}
    }
  };

  /**
   * Tenta abrir o share-sheet nativo do Android/iOS com a IMAGEM do bilhete.
   *
   * Estratégia robusta:
   *   1. Se navigator.share existir, tenta SEMPRE com files primeiro — mesmo
   *      sem checar canShare (algumas versões do Chrome retornam canShare=false
   *      mas aceitam a chamada). Isso garante que o WhatsApp recebe a IMAGEM,
   *      não só o texto.
   *   2. Só cai pra share sem files se a tentativa com files falhar com erro
   *      explícito. AbortError = usuário cancelou, consideramos sucesso.
   *   3. Retorna `"image"` se conseguiu compartilhar a imagem, `"text-only"`
   *      se compartilhou apenas texto, ou `false` se nada funcionou.
   */
  const tentarShareNativo = async (
    file: File,
    text: string,
  ): Promise<"image" | "text-only" | false> => {
    if (typeof navigator.share !== "function") return false;

    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const canShareFiles = nav.canShare?.({ files: [file] }) ?? true;

    if (canShareFiles) {
      try {
        await navigator.share({ files: [file], title: "Bilhete", text });
        return "image";
      } catch (err) {
        const msg = (err as Error).message || "";
        if (/abort/i.test(msg) || (err as { name?: string })?.name === "AbortError") {
          return "image";
        }
        console.warn("[Compartilhar] navigator.share(files) falhou:", err);
      }
    }

    try {
      await navigator.share({ title: "Bilhete", text });
      return "text-only";
    } catch (err) {
      const msg = (err as Error).message || "";
      if (/abort/i.test(msg) || (err as { name?: string })?.name === "AbortError") {
        return "text-only";
      }
      console.warn("[Compartilhar] navigator.share(text) falhou:", err);
    }
    return false;
  };

  const onClick = async () => {
    setErro(null);
    const el = targetRef.current as HTMLElement | null;
    if (!el) {
      setErro("Bilhete não está visível.");
      return;
    }
    setLoading(true);
    try {
      const blob = await gerarBlobPng(el);
      const file = new File([blob], filename, { type: "image/png" });
      const url = URL.createObjectURL(blob);

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;

      const resultado = await tentarShareNativo(file, caption);
      if (resultado === "image") {
        // Share-sheet nativo abriu COM a imagem do bilhete — exatamente o
        // que queremos. Não mostra a sheet customizada.
        setSheet(null);
        return;
      }

      // Tenta copiar a imagem para a área de transferência antes de abrir a sheet.
      // Em alguns navegadores Android o usuário pode então colar direto no chat
      // do WhatsApp.
      try {
        const w = window as unknown as { ClipboardItem?: typeof ClipboardItem };
        if (navigator.clipboard && typeof w.ClipboardItem === "function") {
          const item = new ClipboardItem({ "image/png": blob });
          await navigator.clipboard.write([item]);
        }
      } catch (e) {
        console.warn("[Compartilhar] clipboard.write image falhou:", e);
      }

      if (resultado === "text-only") {
        setErro("Seu navegador não permite enviar imagem direto. Imagem copiada — cole no chat ou use os botões abaixo.");
      }
      setSheet({ url, file, blob });
    } catch (e) {
      console.error("[Compartilhar] Falha total:", e);
      const captionFallback = caption || "Bilhete";
      const nav = navigator as Navigator;
      try {
        if (typeof nav.share === "function") {
          await nav.share({ title: "Bilhete", text: captionFallback });
          return;
        }
      } catch {}
      try { await navigator.clipboard?.writeText(captionFallback); } catch {}
      setErro("Não foi possível gerar a imagem. Texto copiado para a área de transferência.");
    } finally {
      setLoading(false);
    }
  };

  const closeSheet = () => setSheet(null);

  return (
    <div className={`inline-flex flex-col items-stretch ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Gerando...
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4m0 0L8 6m4-4v14" />
            </svg>
            {label}
          </>
        )}
      </button>
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}

      {sheet && (
        <ShareSheet
          imgUrl={sheet.url}
          imgBlob={sheet.blob}
          imgFile={sheet.file}
          filename={filename}
          caption={caption}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}

/**
 * Sheet própria que aparece quando o navegador não permite Web Share API
 * com arquivo (HTTP/inseguro ou Web Share indisponível). Antes de abrir o app
 * destino, tenta:
 *   1) Web Share API com files (clique dentro de um user gesture válido).
 *   2) Copiar a IMAGEM para a área de transferência (Clipboard API).
 *   3) Baixar o PNG (sempre) e abrir o WhatsApp/Telegram com o texto.
 */
function ShareSheet({
  imgUrl,
  imgBlob,
  imgFile,
  filename,
  caption,
  onClose,
}: {
  imgUrl: string;
  imgBlob: Blob;
  imgFile: File;
  filename: string;
  caption: string;
  onClose: () => void;
}) {
  const [copiando, setCopiando] = useState(false);
  const textoEnc = encodeURIComponent(caption || "Confira meu bilhete!");

  const baixar = () => {
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const tentarShareNativoFile = async (): Promise<boolean> => {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (typeof navigator.share === "function" && nav.canShare && nav.canShare({ files: [imgFile] })) {
        await navigator.share({ files: [imgFile], title: "Bilhete", text: caption });
        return true;
      }
    } catch (err) {
      const msg = (err as Error).message || "";
      if (/abort/i.test(msg)) return true;
    }
    return false;
  };

  const copiarImagem = async (): Promise<boolean> => {
    try {
      const w = window as unknown as { ClipboardItem?: typeof ClipboardItem };
      if (navigator.clipboard && typeof w.ClipboardItem === "function") {
        const item = new ClipboardItem({ "image/png": imgBlob });
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch (e) {
      console.warn("[Compartilhar] copiarImagem falhou:", e);
    }
    return false;
  };

  const copiarTexto = async () => {
    try {
      await navigator.clipboard?.writeText(caption);
      alert("Texto copiado. Cole no app desejado.");
    } catch {
      alert("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  /**
   * Fluxo "Enviar via WhatsApp/Telegram" sem HTTPS:
   *   - Tenta o Web Share API com arquivo (clique recente é user gesture).
   *   - Senão, copia a IMAGEM e baixa o PNG.
   *   - Abre o app destino com a legenda.
   *   - Avisa o usuário para colar (ou anexar a imagem baixada).
   */
  const enviarPara = async (destino: "whatsapp" | "telegram") => {
    setCopiando(true);
    try {
      const ok = await tentarShareNativoFile();
      if (ok) {
        onClose();
        return;
      }

      const imagemCopiada = await copiarImagem();
      baixar();

      const url =
        destino === "whatsapp"
          ? `https://wa.me/?text=${textoEnc}`
          : `https://t.me/share/url?url=${textoEnc}`;
      const win = window.open(url, "_blank", "noopener");
      if (!win) {
        // popup bloqueado: forçar navegação no mesmo tab
        window.location.href = url;
      }

      setTimeout(() => {
        if (imagemCopiada) {
          alert(
            "Imagem copiada e baixada. No chat do WhatsApp, toque e segure o campo de mensagem → Colar para anexar a foto. Se não colar, toque no clipe 📎 e selecione 'Galeria'.",
          );
        } else {
          alert(
            "Imagem baixada (na pasta Downloads). No chat do WhatsApp, toque no clipe 📎 → Galeria e escolha o bilhete.",
          );
        }
      }, 600);
    } finally {
      setCopiando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-2xl dark:bg-slate-800 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Compartilhar bilhete</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Toque em <strong>WhatsApp</strong> ou <strong>Telegram</strong>: a imagem é copiada e baixada,
          e o chat abre com a legenda — basta colar (toque longo no campo de mensagem → Colar) ou usar
          o clipe 📎 e selecionar a foto da galeria.
        </p>

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgUrl} alt="Pré-visualização do bilhete" className="mx-auto max-h-56 w-auto rounded" />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            disabled={copiando}
            onClick={() => enviarPara("whatsapp")}
            className="flex flex-col items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 2.1.55 4.07 1.6 5.85L2 22l4.35-1.7c1.71.95 3.66 1.45 5.69 1.45 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 17.91c-1.79 0-3.55-.48-5.08-1.39l-.36-.21-2.58 1.01.99-2.52-.24-.39c-1-1.6-1.53-3.44-1.53-5.31 0-5.4 4.4-9.8 9.81-9.8s9.79 4.4 9.79 9.8c0 5.41-4.4 9.81-9.8 9.81z" />
              <path d="M17.43 14.32c-.29-.15-1.74-.86-2.01-.96-.27-.1-.47-.15-.66.15-.2.29-.76.96-.93 1.15-.17.19-.34.22-.63.07-.29-.15-1.24-.46-2.36-1.45-.87-.78-1.46-1.74-1.63-2.03-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.03-.51-.07-.15-.66-1.59-.91-2.18-.24-.57-.48-.49-.66-.5h-.56c-.2 0-.51.07-.78.37-.27.29-1.03 1.01-1.03 2.46s1.05 2.85 1.2 3.05c.15.2 2.08 3.17 5.04 4.45.7.3 1.25.48 1.68.61.71.23 1.35.2 1.86.12.57-.09 1.74-.71 1.98-1.4.24-.69.24-1.28.17-1.4-.07-.13-.27-.2-.56-.34z" />
            </svg>
            {copiando ? "Preparando..." : "WhatsApp"}
          </button>

          <button
            type="button"
            disabled={copiando}
            onClick={() => enviarPara("telegram")}
            className="flex flex-col items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.24 3.64 11.95c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.05-1.99 1.93c-.23.23-.42.42-.83.42z" />
            </svg>
            Telegram
          </button>

          <button
            type="button"
            onClick={baixar}
            className="flex flex-col items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Baixar PNG
          </button>

          <button
            type="button"
            onClick={copiarTexto}
            className="flex flex-col items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a2 2 0 012-2h10" />
            </svg>
            Copiar texto
          </button>
        </div>
      </div>
    </div>
  );
}
