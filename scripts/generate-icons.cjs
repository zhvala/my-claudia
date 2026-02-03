const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const SOURCE_IMAGE = path.join(__dirname, '..', 'source-icon.png');
const DESKTOP_ICONS_DIR = path.join(__dirname, '..', 'apps', 'desktop', 'src-tauri', 'icons');
const PWA_PUBLIC_DIR = path.join(__dirname, '..', 'claudecodeui', 'public');
const PWA_ICONS_DIR = path.join(PWA_PUBLIC_DIR, 'icons');
const DESKTOP_PUBLIC_DIR = path.join(__dirname, '..', 'apps', 'desktop', 'public');

// Tauri desktop icon sizes
const TAURI_ICONS = [
  { name: '32x32.png', size: 32 },
  { name: '64x64.png', size: 64 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
  { name: 'Square30x30Logo.png', size: 30 },
  { name: 'Square44x44Logo.png', size: 44 },
  { name: 'Square71x71Logo.png', size: 71 },
  { name: 'Square89x89Logo.png', size: 89 },
  { name: 'Square107x107Logo.png', size: 107 },
  { name: 'Square142x142Logo.png', size: 142 },
  { name: 'Square150x150Logo.png', size: 150 },
  { name: 'Square284x284Logo.png', size: 284 },
  { name: 'Square310x310Logo.png', size: 310 },
  { name: 'StoreLogo.png', size: 50 },
];

// Android icon sizes (for each mipmap directory)
const ANDROID_ICONS = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

// iOS icon sizes
const IOS_ICONS = [
  { name: 'AppIcon-20x20@1x.png', size: 20 },
  { name: 'AppIcon-20x20@2x.png', size: 40 },
  { name: 'AppIcon-20x20@3x.png', size: 60 },
  { name: 'AppIcon-29x29@1x.png', size: 29 },
  { name: 'AppIcon-29x29@2x.png', size: 58 },
  { name: 'AppIcon-29x29@3x.png', size: 87 },
  { name: 'AppIcon-40x40@1x.png', size: 40 },
  { name: 'AppIcon-40x40@2x.png', size: 80 },
  { name: 'AppIcon-40x40@3x.png', size: 120 },
  { name: 'AppIcon-60x60@2x.png', size: 120 },
  { name: 'AppIcon-60x60@3x.png', size: 180 },
  { name: 'AppIcon-76x76@1x.png', size: 76 },
  { name: 'AppIcon-76x76@2x.png', size: 152 },
  { name: 'AppIcon-83.5x83.5@2x.png', size: 167 },
  { name: 'AppIcon-512@2x.png', size: 1024 },
];

// PWA icon sizes
const PWA_LOGOS = [
  { name: 'logo-32.png', size: 32 },
  { name: 'logo-64.png', size: 64 },
  { name: 'logo-128.png', size: 128 },
  { name: 'logo-256.png', size: 256 },
  { name: 'logo-512.png', size: 512 },
  { name: 'favicon.png', size: 32 },
];

const PWA_ICONS = [
  { name: 'icon-72x72.png', size: 72 },
  { name: 'icon-96x96.png', size: 96 },
  { name: 'icon-128x128.png', size: 128 },
  { name: 'icon-144x144.png', size: 144 },
  { name: 'icon-152x152.png', size: 152 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-384x384.png', size: 384 },
  { name: 'icon-512x512.png', size: 512 },
];

async function generateIcon(sourceBuffer, outputPath, size) {
  await sharp(sourceBuffer)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outputPath);
  console.log(`Generated: ${path.basename(outputPath)} (${size}x${size})`);
}

async function generateIcns(sourceBuffer, outputPath) {
  const iconsetDir = path.join(path.dirname(outputPath), 'icon.iconset');

  // Create iconset directory
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }

  // Generate all required sizes for iconset
  const iconsetSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];

  for (const icon of iconsetSizes) {
    await generateIcon(sourceBuffer, path.join(iconsetDir, icon.name), icon.size);
  }

  // Use iconutil to create .icns
  const { execSync } = require('child_process');
  execSync(`iconutil -c icns "${iconsetDir}" -o "${outputPath}"`);
  console.log(`Generated: icon.icns`);

  // Clean up iconset directory
  fs.rmSync(iconsetDir, { recursive: true });
}

async function generateIco(sourceBuffer, outputPath) {
  // Generate PNGs for ICO (16, 32, 48, 256)
  const icoSizes = [16, 32, 48, 256];
  const pngBuffers = [];

  for (const size of icoSizes) {
    const buffer = await sharp(sourceBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    pngBuffers.push(buffer);
  }

  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(outputPath, icoBuffer);
  console.log(`Generated: icon.ico`);
}

async function main() {
  console.log('Starting icon generation...\n');

  // Check if source image exists
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error(`Source image not found: ${SOURCE_IMAGE}`);
    console.error('Please place your icon image as "source-icon.png" in the project root.');
    process.exit(1);
  }

  const sourceBuffer = fs.readFileSync(SOURCE_IMAGE);

  // 1. Generate Tauri desktop icons
  console.log('\n--- Generating Tauri Desktop Icons ---');
  for (const icon of TAURI_ICONS) {
    await generateIcon(sourceBuffer, path.join(DESKTOP_ICONS_DIR, icon.name), icon.size);
  }

  // 2. Generate macOS .icns
  console.log('\n--- Generating macOS .icns ---');
  await generateIcns(sourceBuffer, path.join(DESKTOP_ICONS_DIR, 'icon.icns'));

  // 3. Generate Windows .ico
  console.log('\n--- Generating Windows .ico ---');
  await generateIco(sourceBuffer, path.join(DESKTOP_ICONS_DIR, 'icon.ico'));

  // 4. Generate Android icons
  console.log('\n--- Generating Android Icons ---');
  const androidDir = path.join(DESKTOP_ICONS_DIR, 'android');
  for (const icon of ANDROID_ICONS) {
    const dir = path.join(androidDir, icon.dir);
    await generateIcon(sourceBuffer, path.join(dir, 'ic_launcher.png'), icon.size);
    await generateIcon(sourceBuffer, path.join(dir, 'ic_launcher_foreground.png'), icon.size);
    await generateIcon(sourceBuffer, path.join(dir, 'ic_launcher_round.png'), icon.size);
  }

  // 5. Generate iOS icons
  console.log('\n--- Generating iOS Icons ---');
  const iosDir = path.join(DESKTOP_ICONS_DIR, 'ios');
  for (const icon of IOS_ICONS) {
    await generateIcon(sourceBuffer, path.join(iosDir, icon.name), icon.size);
  }

  // 6. Generate PWA logos
  console.log('\n--- Generating PWA Logos ---');
  for (const icon of PWA_LOGOS) {
    await generateIcon(sourceBuffer, path.join(PWA_PUBLIC_DIR, icon.name), icon.size);
  }

  // 7. Generate PWA icons
  console.log('\n--- Generating PWA Icons ---');
  for (const icon of PWA_ICONS) {
    await generateIcon(sourceBuffer, path.join(PWA_ICONS_DIR, icon.name), icon.size);
  }

  // 8. Clean up duplicate iOS files
  console.log('\n--- Cleaning up duplicate iOS files ---');
  const duplicates = [
    'AppIcon-20x20@2x-1.png',
    'AppIcon-29x29@2x-1.png',
    'AppIcon-40x40@2x-1.png',
  ];
  for (const dup of duplicates) {
    const dupPath = path.join(iosDir, dup);
    if (fs.existsSync(dupPath)) {
      fs.unlinkSync(dupPath);
      console.log(`Removed duplicate: ${dup}`);
    }
  }

  console.log('\n=== Icon generation complete! ===');
}

main().catch(console.error);
