const CFB = require("cfb");
const path = require("node:path");
const yauzl = require("yauzl");
const AppError = require("../utils/appError");

const typesByExtension = {
  ".pdf": { contentType: "application/pdf" },
  ".doc": { contentType: "application/msword" },
  ".docx": { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
};
const oleMagic = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function hasOleMagic(buffer) {
  return buffer.length >= oleMagic.length && buffer.subarray(0, oleMagic.length).equals(oleMagic);
}

function isLegacyWordDocument(buffer) {
  if (!hasOleMagic(buffer)) return false;

  try {
    const compoundFile = CFB.read(buffer, { type: "buffer" });
    return Boolean(CFB.find(compoundFile, "WordDocument"));
  } catch {
    return false;
  }
}

function isDocx(buffer) {
  return yauzl.fromBufferPromise(buffer, {
    lazyEntries: true,
    validateEntrySizes: true,
    strictFileNames: true,
  }).then((zipFile) => new Promise((resolve, reject) => {
    let hasDocument = false;
    let hasContentTypes = false;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    zipFile.on("error", reject);
    zipFile.on("end", () => finish(hasDocument && hasContentTypes));
    zipFile.on("entry", (entry) => {
      if (entry.fileName === "word/document.xml" && entry.uncompressedSize > 0) {
        hasDocument = true;
        zipFile.readEntry();
        return;
      }

      if (entry.fileName !== "[Content_Types].xml") {
        zipFile.readEntry();
        return;
      }

      if (entry.uncompressedSize > 256 * 1024) {
        finish(false);
        zipFile.close();
        return;
      }

      zipFile.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks = [];
        let totalBytes = 0;
        stream.on("data", (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > 256 * 1024) {
            finish(false);
            zipFile.close();
            stream.destroy();
            return;
          }
          chunks.push(chunk);
        });
        stream.on("error", reject);
        stream.on("end", () => {
          const contents = Buffer.concat(chunks).toString("utf8");
          hasContentTypes = /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/i.test(contents);
          zipFile.readEntry();
        });
      });
    });
    zipFile.readEntry();
  })).catch(() => false);
}

async function validateDocument(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new AppError(400, "A document file is required");
  }

  const extension = path.extname(file.originalname || "").toLowerCase();
  const expectedType = typesByExtension[extension];
  if (!expectedType) throw new AppError(415, "Only PDF, DOC, and DOCX files are supported");

  let valid = false;
  if (extension === ".pdf") {
    valid = file.buffer.length >= 5 && file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  } else if (extension === ".doc") {
    valid = isLegacyWordDocument(file.buffer);
  } else if (extension === ".docx") {
    valid = await isDocx(file.buffer);
  }

  if (!valid) throw new AppError(415, "File contents do not match a supported document format");
  return { extension, contentType: expectedType.contentType };
}

module.exports = { validateDocument };