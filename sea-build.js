const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');
const archiver = require('archiver');
const packageJson = require('./package.json');

const buildDir = path.join(__dirname, 'build');
const bundlePath = path.join(buildDir, 'bundle.js');
const exeName = 'uo_cm5_webapi.exe';
const exePath = path.join(buildDir, exeName);
const blobPath = path.join(buildDir, 'cm5b.blob');
const nodeExePath = process.execPath;

async function build() {
  try {
    console.log('Starting build process...');

    // 1. Clean and create build directory
    console.log(`Cleaning and creating build directory at: ${buildDir}`);
    fs.emptyDirSync(buildDir);

    // 2. Read default commands for embedding
    console.log('Reading default commands.json for embedding...');
    const commandsJsonString = fs.readFileSync(path.join(__dirname, 'config', 'commands.json'), 'utf8');

    // 3. Bundle application source code with esbuild
    console.log('Bundling application source code...');
    await esbuild.build({
      entryPoints: ['src/server.js'],
      bundle: true,
      outfile: bundlePath,
      platform: 'node',
      target: 'node18', // Based on original pkg config
      define: {
        'IS_SEA_BUILD': 'true',
        'process.env.DEFAULT_COMMANDS_JSON': JSON.stringify(commandsJsonString)
      }
    });
    console.log(`Bundle created at: ${bundlePath}`);

    // 4. Copy assets
    console.log('Copying assets...');
    fs.copySync(path.join(__dirname, 'public'), path.join(buildDir, 'public'));
    
    // 5. Generate SEA blob from the bundle
    console.log('Generating SEA blob...');
    execSync('node --experimental-sea-config sea-config.json', { stdio: 'inherit' });

    // 6. Copy node executable
    console.log(`Copying node executable from ${nodeExePath} to ${exePath}...`);
    fs.copyFileSync(nodeExePath, exePath);

    // 7. Inject blob into the executable
    console.log('Injecting blob into executable...');
    execSync(`npx postject "${exePath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`, { stdio: 'inherit' });

    console.log('Build finished successfully!');
    console.log(`Executable created at: ${exePath}`);

    // 8. Create distribution directory
    const distDir = path.join(__dirname, 'dist');
    console.log(`Creating distribution directory at: ${distDir}`);
    fs.emptyDirSync(distDir);

    // 9. Copy final assets to dist
    console.log('Copying files to distribution directory...');
    fs.copySync(exePath, path.join(distDir, exeName));
    fs.copySync(path.join(buildDir, 'public'), path.join(distDir, 'public'));
    fs.copySync(path.join(__dirname, 'README.md'), path.join(distDir, 'README.md'));
    fs.copySync(path.join(__dirname, 'README.en.md'), path.join(distDir, 'README.en.md'));
    
    // Copy contents of 'windows' directory to 'dist' directory
    fs.readdirSync(path.join(__dirname, 'windows')).forEach(file => {
        const srcPath = path.join(__dirname, 'windows', file);
        const destPath = path.join(distDir, file);
        fs.copySync(srcPath, destPath);
    });

    // --- uo_cm5_watcherのファイルコピー ---
    console.log('Copying uo_cm5_watcher files to distribution directory...');
    const watcherBuildDir = path.join(__dirname, 'windows_watcher', 'UnofficialCueMix5Watcher', 'bin', 'Release', 'net8.0-windows');
    const watcherFiles = [
        'uo_cm5_watcher.exe',
        'uo_cm5_watcher.dll',
        'uo_cm5_watcher.runtimeconfig.json',
        'uo_cm5_watcher.deps.json',
        'uo_cm5_watcher.cfg'
    ];
    watcherFiles.forEach(file => {
        const src = path.join(watcherBuildDir, file);
        const dest = path.join(distDir, file);
        if (fs.existsSync(src)) {
            fs.copySync(src, dest);
            console.log(`Copied ${file} to ${distDir}`);
        } else {
            console.warn(`Warning: ${file} not found at ${src}`);
        }
    });

    console.log('Distribution package created successfully in "dist" directory!');

    // 10. Create release directory
    const releaseDir = path.join(__dirname, 'release');
    console.log(`Ensuring release directory exists at: ${releaseDir}`);
    fs.ensureDirSync(releaseDir);

    // 11. Create zip archive
    const zipFileName = `uo_cm5_webapi_v${packageJson.version.replace(/\./g, '_')}.zip`;
    console.log(`Creating zip archive: ${zipFileName}...`);
    const output = fs.createWriteStream(path.join(releaseDir, zipFileName));
    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    return new Promise((resolve, reject) => {
        output.on('close', () => {
            console.log(`Archive created successfully. Total size: ${archive.pointer()} bytes`);
            resolve();
        });
        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                console.warn(err);
            } else {
                reject(err);
            }
        });
        archive.on('error', (err) => {
            reject(err);
        });
        archive.pipe(output);
        archive.directory(distDir, false);
        archive.finalize();
    });

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build().catch(err => {
    console.error('An unexpected error occurred during the build process:', err);
    process.exit(1);
});