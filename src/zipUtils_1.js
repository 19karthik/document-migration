const path = require("path");
const unzipper = require("unzipper");
const fs = require("fs-extra");

async function extractZip(zipPath, extractTo) {
  // Get just the file name without extension
  const baseName = path.basename(zipPath, ".zip"); // e.g., "tenant123-payslips_1748934000880_30may2025_payroll"
  const targetDir = path.join(extractTo, baseName);

  const directory = await unzipper.Open.file(zipPath);

  await Promise.all(
    directory.files.map(async (file) => {
      if (!file.path || file.path.endsWith("/")) return; // skip directories

      const filePath = path.join(targetDir, file.path);
      await fs.ensureDir(path.dirname(filePath));

      return new Promise((resolve, reject) => {
        file
          .stream()
          .pipe(fs.createWriteStream(filePath))
          .on("finish", resolve)
          .on("error", reject);
      });
    })
  );

  await fs.remove(zipPath);
  console.log(`Deleted original zip file: ${zipPath}`);

  console.log(`Extracted ${zipPath} to ${targetDir}`);

  return targetDir; // Return the final extracted directory
}

module.exports = { extractZip };
