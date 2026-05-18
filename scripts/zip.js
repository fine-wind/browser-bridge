#!/usr/bin/env node
// 纯 Node.js ZIP 打包（最小依赖，用于构建 .xpi）
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const [,, srcDir, outFile] = process.argv;
if (!srcDir || !outFile) {
  console.error("用法: node zip.js <源目录> <输出文件>");
  process.exit(1);
}

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const END_SIG = 0x06054b50;

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function collectFiles(dir, baseDir = dir) {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(baseDir, full);
    const stat = fs.statSync(full);
    if (name.startsWith(".git") || name === "node_modules" || name === "releases") continue;
    if (stat.isDirectory()) {
      entries.push({ path: rel + "/", isDir: true, size: 0 });
      entries.push(...collectFiles(full, baseDir));
    } else {
      entries.push({ path: rel, isDir: false, size: stat.size, mtime: Math.floor(stat.mtimeMs / 1000) });
    }
  }
  return entries;
}

function makeLocalEntry(path, data, crc) {
  const nameBuf = Buffer.from(path, "utf-8");
  const compressed = data.length > 0 ? zlib.deflateRawSync(data, { level: 9 }) : Buffer.alloc(0);
  
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_HEADER_SIG, 0);
  header.writeUInt16LE(20, 4);           // version needed
  header.writeUInt16LE(0, 6);            // flags
  header.writeUInt16LE(8, 8);            // compression: deflate
  header.writeUInt32LE(crc, 14);         // crc-32
  header.writeUInt32LE(compressed.length, 18); // compressed size
  header.writeUInt32LE(data.length, 22);       // uncompressed size
  header.writeUInt16LE(nameBuf.length, 26);    // file name length
  header.writeUInt16LE(0, 28);           // extra field length

  return { header, nameBuf, compressed, crc, uncompressedSize: data.length, compressedSize: compressed.length };
}

function makeCentralEntry(localOffset, entry) {
  const nameBuf = entry.nameBuf;
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_HEADER_SIG, 0);
  header.writeUInt16LE(20, 4);           // version made by
  header.writeUInt16LE(20, 6);           // version needed
  header.writeUInt16LE(0, 8);            // flags
  header.writeUInt16LE(8, 10);           // compression
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.uncompressedSize, 24);
  header.writeUInt16LE(nameBuf.length, 28);
  header.writeUInt16LE(0, 30);           // extra field length
  header.writeUInt16LE(0, 32);           // file comment length
  header.writeUInt16LE(0, 34);           // disk start
  header.writeUInt16LE(0, 36);           // internal attrs
  header.writeUInt32LE(0, 38);           // external attrs
  header.writeUInt32LE(localOffset, 42); // offset of local header

  const data = entry.isDir ? Buffer.alloc(0) : Buffer.concat([
    entry.compressed,
    entry.compressed.length % 2 === 0 ? Buffer.alloc(0) : Buffer.alloc(1), // padding
  ]);

  return { header, nameBuf, data };
}

const files = collectFiles(srcDir);
const chunks = [];
let localOffset = 0;
const centralEntries = [];

for (const file of files) {
  const data = file.isDir ? Buffer.alloc(0) : fs.readFileSync(path.join(srcDir, file.path));
  const crc = data.length > 0 ? crc32(data) : 0;
  const entry = makeLocalEntry(file.path, data, crc);

  chunks.push(entry.header, entry.nameBuf, entry.compressed);
  if (entry.compressed.length % 2 !== 0) chunks.push(Buffer.alloc(1));

  centralEntries.push(makeCentralEntry(localOffset, entry));
  localOffset += 30 + entry.nameBuf.length + (entry.isDir ? 0 : entry.compressed.length + (entry.compressed.length % 2));
}

const centralStart = Buffer.concat(chunks).length;
for (const ce of centralEntries) {
  chunks.push(ce.header, ce.nameBuf, ce.data);
}

const centralEnd = Buffer.concat(chunks).length;
const centralSize = centralEnd - centralStart;

const endRecord = Buffer.alloc(22);
endRecord.writeUInt32LE(END_SIG, 0);
endRecord.writeUInt16LE(0, 4);            // disk
endRecord.writeUInt16LE(0, 6);            // disk of central dir
endRecord.writeUInt16LE(centralEntries.length, 8);
endRecord.writeUInt16LE(centralEntries.length, 10);
endRecord.writeUInt32LE(centralSize, 12);
endRecord.writeUInt32LE(centralStart, 16);
endRecord.writeUInt16LE(0, 20);           // comment length
chunks.push(endRecord);

const zip = Buffer.concat(chunks);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, zip);

const size = (zip.length / 1024).toFixed(1);
console.log(`✅ ${path.basename(outFile)} (${size} KB)`);
