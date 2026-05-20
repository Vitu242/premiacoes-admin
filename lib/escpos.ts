"use client";

/**
 * Impressão térmica ESC/POS via Web Bluetooth.
 * Suporta a maioria das mini-impressoras 58 mm que expõem perfil GATT
 * com serviço FFE0 / characteristic FFE1, ou serviço genérico de impressão.
 *
 * Uso:
 *   const printer = await connectPrinter();
 *   await printer.printBilhete({...});
 *   await printer.disconnect();
 */

// Tipagem mínima da Web Bluetooth API utilizada por este módulo.
// Mantida local para evitar dependência de @types/web-bluetooth (que pode
// não estar instalado em todos os ambientes).
interface BTCharacteristicLike {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValue?: (data: Uint8Array | ArrayBuffer) => Promise<void>;
  writeValueWithoutResponse?: (data: Uint8Array | ArrayBuffer) => Promise<void>;
}
interface BTServiceLike {
  getCharacteristic: (uuid: string) => Promise<BTCharacteristicLike>;
  getCharacteristics: () => Promise<BTCharacteristicLike[]>;
}
interface BTServerLike {
  getPrimaryService: (uuid: string) => Promise<BTServiceLike>;
  getPrimaryServices: () => Promise<BTServiceLike[]>;
  disconnect: () => void;
}
interface BTDeviceLike {
  name?: string | null;
  gatt?: { connect: () => Promise<BTServerLike> } | null;
}
interface WebBluetoothLike {
  requestDevice: (opts: {
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }) => Promise<BTDeviceLike>;
}

declare global {
  interface Navigator {
    bluetooth?: WebBluetoothLike;
  }
}

const ESC = 0x1b;
const GS = 0x1d;

const ENCODER = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

function bytes(...arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

function concat(parts: (Uint8Array | string)[]): Uint8Array {
  const chunks: Uint8Array[] = parts.map((p) =>
    typeof p === "string" ? ENCODER!.encode(p) : p
  );
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

const init = bytes(ESC, 0x40);
const align = (n: 0 | 1 | 2) => bytes(ESC, 0x61, n); // 0=left, 1=center, 2=right
const bold = (on: boolean) => bytes(ESC, 0x45, on ? 1 : 0);
const sizeNormal = bytes(GS, 0x21, 0x00);
const sizeDouble = bytes(GS, 0x21, 0x11);
const cut = bytes(GS, 0x56, 0x42, 0x00);

export interface BilheteImprimivel {
  banca: string;
  codigo: string;
  data: string;
  cambista: string;
  extracaoNome: string;
  itens: { modalidade: string; numeros: string; valor: number; premio?: string }[];
  total: number;
  rodape?: string;
}

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildBilheteBytes(b: BilheteImprimivel): Uint8Array {
  const linhas: (Uint8Array | string)[] = [];
  linhas.push(init);
  linhas.push(align(1), sizeDouble, bold(true), b.banca + "\n", bold(false), sizeNormal);
  linhas.push(`Extração: ${b.extracaoNome}\n`);
  linhas.push(`Data: ${b.data}\n`);
  linhas.push(`Cambista: ${b.cambista}\n`);
  linhas.push(`Código: ${b.codigo}\n`);
  linhas.push("--------------------------------\n");
  linhas.push(align(0));
  for (const it of b.itens) {
    linhas.push(`${it.modalidade.toUpperCase()}  ${it.premio ?? "1/1"}\n`);
    linhas.push(`  ${it.numeros}\n`);
    linhas.push(`  R$ ${moeda(it.valor)}\n`);
  }
  linhas.push("--------------------------------\n");
  linhas.push(align(2), bold(true), `TOTAL: ${moeda(b.total)}\n`, bold(false));
  linhas.push(align(1));
  if (b.rodape) {
    linhas.push("\n");
    linhas.push(b.rodape + "\n");
  }
  linhas.push("\n\n\n");
  linhas.push(cut);
  return concat(linhas);
}

const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // genérico
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
];
const PRINTER_CHARS = [
  "00002af1-0000-1000-8000-00805f9b34fb",
  "0000ffe1-0000-1000-8000-00805f9b34fb",
  "0000ff02-0000-1000-8000-00805f9b34fb",
];

export interface Printer {
  printBilhete: (b: BilheteImprimivel) => Promise<void>;
  disconnect: () => Promise<void>;
  deviceName: string | null;
}

export async function connectPrinter(): Promise<Printer> {
  if (typeof navigator === "undefined" || !navigator.bluetooth) {
    throw new Error("Web Bluetooth não suportado neste dispositivo/navegador.");
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });
  const server = await device.gatt!.connect();
  let characteristic: BTCharacteristicLike | null = null;
  for (const svc of PRINTER_SERVICES) {
    try {
      const s = await server.getPrimaryService(svc);
      for (const ch of PRINTER_CHARS) {
        try {
          const c = await s.getCharacteristic(ch);
          if (c) { characteristic = c; break; }
        } catch {}
      }
      if (characteristic) break;
    } catch {}
  }
  if (!characteristic) {
    // Tenta achar qualquer characteristic com writeWithoutResponse
    const services = await server.getPrimaryServices();
    outer: for (const s of services) {
      const chars = await s.getCharacteristics();
      for (const c of chars) {
        if (c.properties.writeWithoutResponse || c.properties.write) {
          characteristic = c;
          break outer;
        }
      }
    }
  }
  if (!characteristic) throw new Error("Nenhuma característica de impressão encontrada.");

  const writeChunked = async (data: Uint8Array) => {
    if (!characteristic) throw new Error("Característica de impressão indisponível.");
    const ch = characteristic;
    const CHUNK = 180;
    for (let i = 0; i < data.length; i += CHUNK) {
      const slice = data.subarray(i, i + CHUNK);
      if (ch.writeValueWithoutResponse) {
        await ch.writeValueWithoutResponse(slice);
      } else if (ch.writeValue) {
        await ch.writeValue(slice);
      }
    }
  };

  return {
    deviceName: device.name ?? null,
    async printBilhete(b: BilheteImprimivel) {
      await writeChunked(buildBilheteBytes(b));
    },
    async disconnect() {
      try { server.disconnect(); } catch {}
    },
  };
}
