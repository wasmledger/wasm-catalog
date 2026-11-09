// SPDX-License-Identifier: Apache-2.0
// Shards are stored gzipped. Some static hosts serve `.gz` files with
// `Content-Encoding: gzip`, in which case the browser has already inflated them;
// others serve the raw bytes. Check the magic number and handle both.

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function gunzipToText(bytes: Uint8Array): Promise<string> {
  if (!isGzip(bytes)) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
