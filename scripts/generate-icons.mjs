import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const iconRoot = path.join(root, 'resources', 'icons');
const source = path.join(iconRoot, 'icon.svg');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'live-translate-icons-'));

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

try {
  run('qlmanage', ['-t', '-s', '1024', '-o', temporary, source]);
  const master = path.join(temporary, 'icon.svg.png');
  await copyFile(master, path.join(iconRoot, 'icon.png'));

  const iconset = path.join(temporary, 'icon.iconset');
  await mkdir(iconset);
  const targets = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];
  for (const [name, size] of targets) {
    run('sips', ['-z', String(size), String(size), master, '--out', path.join(iconset, name)]);
  }
  run('iconutil', ['-c', 'icns', iconset, '-o', path.join(iconRoot, 'icon.icns')]);

  const png256 = await readFile(path.join(iconset, 'icon_256x256.png'));
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png256.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile(path.join(iconRoot, 'icon.ico'), Buffer.concat([header, png256]));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
