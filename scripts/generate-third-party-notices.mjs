import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required to inspect production dependencies.');
const tree = JSON.parse(execFileSync(process.execPath, [
  npmCli, 'ls', '--omit=dev', '--all', '--json', '--long',
], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));

const packages = new Map();
collect(tree.dependencies);

const groups = new Map();
for (const dependency of [...packages.values()].sort((left, right) => left.id.localeCompare(right.id))) {
  const licensePath = findLicense(dependency.path);
  const license = (licensePath
    ? readFileSync(licensePath, 'utf8')
    : fallbackLicense(dependency))
    .replace(/\r\n/gu, '\n')
    .trim();
  const hash = createHash('sha256').update(license).digest('hex');
  const group = groups.get(hash) ?? { license, packages: [] };
  group.packages.push(dependency.id);
  groups.set(hash, group);
}

const sections = [...groups.values()].map(({ license, packages: packageIds }) => [
  '- ' + packageIds.join('\n- '),
  '',
  license,
].join('\n'));

const output = [
  'THIRD-PARTY SOFTWARE NOTICES',
  '============================',
  '',
  'Live Translate for OBS includes the following third-party software and font files.',
  'This file is generated from the installed production dependency tree.',
  '',
  ...sections.flatMap((section, index) => [
    `NOTICE ${index + 1}`,
    '--------',
    section,
    '',
  ]),
].join('\n');

writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.txt'), output, 'utf8');

function collect(dependencies) {
  if (!dependencies) return;
  for (const dependency of Object.values(dependencies)) {
    if (!dependency?.name || !dependency.version || !dependency.path) continue;
    const id = `${dependency.name}@${dependency.version}`;
    packages.set(id, {
      id,
      path: dependency.path,
      license: dependency.license,
      author: typeof dependency.author === 'string'
        ? dependency.author.replace(/\s*<[^>]+>\s*$/u, '')
        : dependency.author?.name,
    });
    collect(dependency.dependencies);
  }
}

function findLicense(packagePath) {
  const candidate = readdirSync(packagePath)
    .filter((name) => /^(license|licence|copying|copyright)(\..*)?$/iu.test(name))
    .sort((left, right) => left.localeCompare(right))[0];
  return candidate ? path.join(packagePath, candidate) : null;
}

function fallbackLicense(dependency) {
  if (dependency.license !== 'MIT' || !dependency.author) {
    throw new Error(`No license file found for ${dependency.id}`);
  }
  return `MIT License

Copyright (c) ${dependency.author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
}
