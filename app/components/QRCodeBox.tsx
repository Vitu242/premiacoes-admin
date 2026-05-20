"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  value: string;
  size?: number;
  className?: string;
  /** Texto exibido abaixo do QR. Default: o próprio value. */
  caption?: string | null;
}

export default function QRCodeBox({ value, size = 140, className = "", caption }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value || "—", { margin: 0, scale: 6 })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setDataUrl(null); });
    return () => { cancelled = true; };
  }, [value]);

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt={`QR ${value}`} width={size} height={size} style={{ width: size, height: size }} />
      ) : (
        <div style={{ width: size, height: size }} className="bg-gray-100" />
      )}
      {caption !== null && (
        <p className="mt-1 font-mono text-[10px] text-gray-700">{caption ?? value}</p>
      )}
    </div>
  );
}
