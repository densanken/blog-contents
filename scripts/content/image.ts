import { readFileSync, statSync } from "node:fs";

import probe from "probe-image-size";
import sharp from "sharp";

import type { Report } from "./shared.ts";

// ブログの plugins/image-check.ts と同じ検査と上限値（拒否する場合は、修正方法を含む理由を Error にして投げる）
const maxBytes = 10_000_000;
const maxPixels = 50_000_000;
const maxFrames = 200;
const formats: Record<string, string> = {
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".gif": "gif",
  ".webp": "webp",
  ".avif": "avif",
};

export const imageExtensions = new Set(Object.keys(formats));

const detect = (b: Buffer) => {
  const ascii = (start: number, end: number) => b.toString("latin1", start, end);
  if (b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "avif";
  return null;
};

const decode = <T>(promise: Promise<T>) =>
  promise.catch(() => {
    throw new Error("画像を展開できません。壊れていないか確認し、書き出し直してください。");
  });

// extension は `.png` のような、小文字のファイルの拡張子
const inspect = async (path: string, extension: string) => {
  if (statSync(path).size > maxBytes)
    throw new Error(
      `画像が大きすぎます（上限 ${String(maxBytes)} バイト）。縮小や圧縮をしてください。`
    );

  const buffer = readFileSync(path);

  const type = detect(buffer);
  if (!type)
    throw new Error(
      "PNG, JPEG, GIF, WebP, AVIF のどれでもありません。画像を書き出し直してください。"
    );
  if (formats[extension] !== type)
    throw new Error(
      `拡張子（${extension}）と画像の形式（${type}）が一致しません。拡張子を直してください。`
    );

  // ヘッダーだけで調べ、展開する前に巨大な画像を拒否する
  const size = probe.sync(buffer);
  if (!size)
    throw new Error("画像のヘッダーを読めません。壊れていないか確認し、書き出し直してください。");
  if (size.width * size.height > maxPixels)
    throw new Error(`画素数が多すぎます（上限 ${String(maxPixels)} 画素）。縮小してください。`);

  const metadata = await decode(
    sharp(buffer, { limitInputPixels: false, animated: true }).metadata()
  );
  const { pages = 1, width, height, pageHeight = height } = metadata;
  if (pages > maxFrames || width * pageHeight * pages > maxPixels)
    throw new Error(
      `フレーム数または全フレームの画素数が多すぎます（上限 ${String(maxFrames)} フレーム、${String(maxPixels)} 画素）。減らしてください。`
    );

  await decode(sharp(buffer, { limitInputPixels: maxPixels, animated: true }).toBuffer());
};

export const checkImage = (path: string, extension: string, report: Report) =>
  inspect(path, extension).catch((e: Error) => {
    report(path, e.message);
  });
