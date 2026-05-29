# Publishing Podium

Two distribution channels: **npm** (`podium-cli`) and **Homebrew**
(`haplollc/tap/podium`). The npm package is the source of truth; the Homebrew
formula just installs the published npm tarball.

---

## A. Publish to npm

### One-time setup
1. **Check the package name is free** (it may not be — `podium-cli` is generic):
   ```bash
   npm view podium-cli
   ```
   If it's taken, rename in `packages/cli/package.json` (e.g. `@haplollc/podium`)
   and update the Homebrew formula + README accordingly. A scoped name
   (`@haplollc/podium`) is recommended and always available.
2. **Log in** as a user with publish rights:
   ```bash
   npm login
   npm whoami        # confirm
   ```

### Each release
```bash
cd ~/terminal_projects/podium

# 1. Bump the version
cd packages/cli && npm version patch --no-git-tag-version && cd ../..
#    (or: minor / major / 0.2.0)

# 2. Build everything, then the self-contained CLI bundle
pnpm -r build
pnpm --filter podium-cli build

# 3. Sanity-check the artifact
node packages/cli/bin/podium.js --version
grep -qE 'from ?"@podium/' packages/cli/dist/index.js \
  && echo "NOT self-contained!" || echo "bundle OK"

# 4. Publish (publishConfig.access is already "public")
cd packages/cli && npm publish && cd ../..

# 5. Verify + commit the version bump
npm view podium-cli version
git commit -am "release: podium $(node -p "require('./packages/cli/package.json').version")"
git tag "v$(node -p "require('./packages/cli/package.json').version")"
git push && git push --tags
```

Users can now:
```bash
npm install -g podium-cli      # or @haplollc/podium
```

### Automated (GitHub Actions)
`.github/workflows/release.yml` already does steps 2–4 on a `v*` tag push. To enable:
1. Create an **npm automation token** (npmjs.com → Access Tokens → Granular/Automation).
2. Add it as a repo secret: **Settings → Secrets and variables → Actions → `NPM_TOKEN`**.
3. Then a release is just:
   ```bash
   git tag v0.2.0 && git push --tags
   ```

---

## B. Publish to Homebrew (a tap)

`brew install haplollc/tap/podium` resolves to a repo named
**`haplollc/homebrew-tap`** containing `Formula/podium.rb`.

### One-time setup
1. Create a public repo **`haplollc/homebrew-tap`**:
   ```bash
   gh repo create haplollc/homebrew-tap --public --description "Homebrew tap for Haplo LLC tools"
   ```
2. Add the formula (copy the one in this repo as a starting point):
   ```bash
   git clone https://github.com/haplollc/homebrew-tap && cd homebrew-tap
   mkdir -p Formula
   cp ~/terminal_projects/podium/Formula/podium.rb Formula/
   ```

### Each release (after the npm publish above)
```bash
VERSION=0.2.0   # the version you just published
URL="https://registry.npmjs.org/podium-cli/-/podium-cli-${VERSION}.tgz"
SHA=$(curl -fsSL "$URL" | shasum -a 256 | awk '{print $1}')

# In the homebrew-tap repo, update Formula/podium.rb:
sed -i '' "s|url \".*\"|url \"${URL}\"|"        Formula/podium.rb
sed -i '' "s|sha256 \".*\"|sha256 \"${SHA}\"|"  Formula/podium.rb

git commit -am "podium ${VERSION}" && git push
```

### Verify
```bash
brew tap haplollc/tap
brew install haplollc/tap/podium
podium --version
```

### Automating the formula bump
The release workflow in this repo bumps the **in-repo** `Formula/podium.rb`. To push
the bump into the separate tap repo instead, add a repo secret `HOMEBREW_TAP_TOKEN`
(a PAT with `repo` scope on `haplollc/homebrew-tap`) and change the workflow's final
step to clone + commit to that repo. Until then, run section B's "each release" block
manually after publishing.

---

## Release checklist (TL;DR)
1. `npm view podium-cli` — name free / logged in
2. bump version → `pnpm -r build` → `pnpm --filter podium-cli build`
3. `podium --version` + bundle self-contained check
4. `npm publish` (from `packages/cli`)
5. tag + push
6. update `haplollc/homebrew-tap` formula `url` + `sha256`
7. `brew install haplollc/tap/podium` to confirm
