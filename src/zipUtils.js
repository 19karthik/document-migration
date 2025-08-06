const path = require("path");
const fs = require("fs-extra");
const StreamZip = require("node-stream-zip");

async function extractZip(zipPath, extractTo) {
  const baseName = path.basename(zipPath, ".zip"); 
  const targetDir = path.join(extractTo, baseName);

  // Get password from last element after `_`
  const parts = baseName.split("_");
  const password = parts[parts.length - 1];

  const zip = new StreamZip.async({ file: zipPath, password });

  try {
    const entries = await zip.entries();

    for (const entry of Object.values(entries)) {
      const entryPath = path.join(targetDir, entry.name);

      if (entry.isDirectory) {
        await fs.ensureDir(entryPath);
      } else {
        await fs.ensureDir(path.dirname(entryPath));
        await zip.extract(entry.name, entryPath);
      }
    }

    console.log(`Extracted ${zipPath} to ${targetDir}`);
  } catch (err) {
    console.error("Extraction failed:", err.message);
    throw err;
  } finally {
    await zip.close();
    await fs.remove(zipPath);
    console.log(`Deleted original zip file: ${zipPath}`);
  }

  return targetDir;
}

module.exports = { extractZip };
