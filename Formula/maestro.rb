class Maestro < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/haplollc/maestro"
  url "https://registry.npmjs.org/maestro-cli/-/maestro-cli-0.1.0.tgz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000" # bumped by CI on release
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "maestro", shell_output("#{bin}/maestro --help")
  end
end
