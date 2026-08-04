import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'win32') process.exit(0);

const root = process.cwd();
const project = path.join(root, 'native', 'windows-audio-capture', 'windows-audio-capture.vcxproj');
const expected = path.join(root, 'native', 'windows-audio-capture', 'bin', 'x64', 'Release', 'windows-audio-capture.exe');

let msbuild = 'msbuild.exe';
const probe = spawnSync(msbuild, ['-version'], { encoding: 'utf8', shell: false });
if (probe.error) {
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  const vswhere = programFilesX86
    ? path.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
    : '';
  const result = vswhere && existsSync(vswhere)
    ? spawnSync(vswhere, ['-latest', '-requires', 'Microsoft.Component.MSBuild', '-find', 'MSBuild\\**\\Bin\\MSBuild.exe'], { encoding: 'utf8', shell: false })
    : null;
  const candidate = result?.stdout.trim().split(/\r?\n/u)[0];
  if (!candidate) throw new Error('MSBuild is required to compile the Windows audio helper.');
  msbuild = candidate;
}

const build = spawnSync(msbuild, [project, '/m', '/p:Configuration=Release', '/p:Platform=x64', '/verbosity:minimal'], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});
if (build.status !== 0 || !existsSync(expected)) {
  throw new Error(`Windows audio helper build failed with exit code ${build.status ?? 'unknown'}.`);
}
