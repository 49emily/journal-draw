import fs from "fs";
import path from "path";
import convert from "heic-convert";

async function convertHeicToJpg(inputPath, outputPath) {
  try {
    // Read the HEIC file
    const inputBuffer = await fs.promises.readFile(inputPath);

    // Convert to JPEG
    const outputBuffer = await convert({
      buffer: inputBuffer,
      format: "JPEG",
      quality: 0.9,
    });

    // Write the JPEG file
    await fs.promises.writeFile(outputPath, outputBuffer);

    console.log(`Converted ${path.basename(inputPath)} to JPEG`);
  } catch (error) {
    console.error(`Error converting ${path.basename(inputPath)}:`, error);
  }
}

async function processDirectory() {
  try {
    // Get all files in images directory
    const files = await fs.promises.readdir("images");

    // Filter for HEIC files
    const heicFiles = files.filter((file) => path.extname(file).toLowerCase() === ".heic");

    // Convert each HEIC file
    for (const file of heicFiles) {
      const inputPath = path.join("images", file);
      const outputPath = path.join("images", path.basename(file, ".heic") + ".jpg");
      await convertHeicToJpg(inputPath, outputPath);
    }

    console.log("Finished converting all HEIC files");
  } catch (error) {
    console.error("Error processing directory:", error);
  }
}

// Run the conversion
processDirectory();
